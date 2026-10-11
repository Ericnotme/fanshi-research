// Node-only Responses HTTP adapter. Never included in the static browser bundle.
import {setTimeout as delay} from 'node:timers/promises';
import {buildResponsesRequest, parseResponses} from './providers.mjs';
import {exactKeys, invariant, digest, runResearch} from './core.mjs';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const INPUT_TOKEN_RESERVE = 8192; // Conservative admission estimate, NOT an API billing guarantee.
const MAX_BODY_BYTES = 65536;
const CONFIG_KEYS = ['provider','model','knowledgeCutoff','maxOutputTokens','networkEnabled','reasoningEffort','timeoutMs','maxRetries','maxAttempts','maxTotalOutputTokens','maxEstimatedCostUsd','inputUsdPerMillion','outputUsdPerMillion'];
const MESSAGES = {
  disabled:'Paid API access requires explicit opt-in.',
  missing_key:'Set OPENAI_API_KEY in the local server environment.',
  invalid_key:'The configured API key is not a valid header value.',
  budget_exhausted:'Local request, output-token or estimated-cost budget exhausted.',
  concurrent_call:'This provider is already processing a request.',
  timeout:'Provider deadline exceeded; remote execution and billing are unknown. No retry.',
  network_error:'Provider network request failed; remote execution and billing are unknown. No retry.',
  oversized_response:'Provider response exceeded the bounded body size.',
  invalid_json:'Provider returned invalid JSON.',
  http_error:'Provider HTTP error; inspect status and account settings without sharing credentials.',
  quota_exhausted:'Provider rejected the request for quota or spend limits. No retry.',
  retry_delay_exceeded:'Provider Retry-After exceeds the local wait limit. No retry.',
  refused:'Provider refused the request. No retry.',
  incomplete:'Provider did not complete the response. No retry.',
  invalid_output:'Provider output violates the fixed strategy contract. No retry.',
  invalid_usage:'Provider usage is missing or exceeds the local reservation. No further calls.',
  audit_failed:'The audit journal could not be written. No further calls.',
};
export class ProviderError extends Error {
  constructor(code, details={}) { super(MESSAGES[code] || 'Provider operation failed.'); this.name='ProviderError';this.code=code;this.details=details; }
}
const failure = (code,details) => new ProviderError(code,details);

export function validateOpenAIConfig(value) {
  const c=structuredClone(value);exactKeys(c,CONFIG_KEYS);
  invariant(c.provider==='openai'&&c.networkEnabled===true,'OpenAI configuration must explicitly enable network');
  buildResponsesRequest(Object.fromEntries(['provider','model','knowledgeCutoff','maxOutputTokens','networkEnabled'].map(k=>[k,c[k]])));
  invariant(['low','medium','high'].includes(c.reasoningEffort),'Invalid reasoning effort');
  for(const [key,min,max] of [['timeoutMs',1,120000],['maxRetries',0,2],['maxAttempts',1,3],['maxTotalOutputTokens',256,12288]]) invariant(Number.isInteger(c[key])&&c[key]>=min&&c[key]<=max,'Invalid provider limit');
  invariant(c.maxTotalOutputTokens>=c.maxOutputTokens,'Output budget cannot fund one request');
  for(const key of ['maxEstimatedCostUsd','inputUsdPerMillion','outputUsdPerMillion']) invariant(Number.isFinite(c[key])&&c[key]>0&&c[key]<=(key==='maxEstimatedCostUsd'?10:1000),'Invalid positive cost limit/rate');
  return c;
}

async function boundedJson(response, controller) {
  const declared=response.headers.get('content-length');
  if(declared!==null&&Number(declared)>MAX_BODY_BYTES){controller.abort();throw failure('oversized_response');}
  const reader=response.body?.getReader();if(!reader)throw failure('invalid_json');
  let length=0;const chunks=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BODY_BYTES){controller.abort();void reader.cancel().catch(()=>{});throw failure('oversized_response');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let cursor=0;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw failure('invalid_json');}
}

async function requestOnce(fetchImpl,body,key,timeoutMs) {
  const controller=new AbortController();let timer;
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('timeout'));},timeoutMs);});
  try {
    return await Promise.race([expired,(async()=>{
      const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body,signal:controller.signal});
      let payload;try{payload=await boundedJson(response,controller);}catch(e){if(response.ok||e.code!=='invalid_json')throw e;payload=null;}
      return {status:response.status,ok:response.ok,payload,retryAfter:response.headers.get('retry-after')};
    })()]);
  }catch(e){if(e instanceof ProviderError)throw e;throw failure(controller.signal.aborted?'timeout':'network_error');}
  finally{clearTimeout(timer);controller.abort();}
}

function retryDelay(header,attempt) {
  const exponential=250*2**(attempt-1);
  if(header===null)return exponential;
  const seconds=Number(header), milliseconds=Number.isFinite(seconds)&&seconds>=0?seconds*1000:Date.parse(header)-Date.now();
  if(!Number.isFinite(milliseconds)||milliseconds>5000)throw failure('retry_delay_exceeded');
  return Math.max(exponential,Math.max(0,milliseconds));
}
function validatedUsage(payload,maxOutputTokens) {
  const u=payload?.usage;
  if(!u||!['input_tokens','output_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.total_tokens!==u.input_tokens+u.output_tokens||u.input_tokens>INPUT_TOKEN_RESERVE||u.output_tokens>maxOutputTokens)throw failure('invalid_usage');
  return {inputTokens:u.input_tokens,outputTokens:u.output_tokens,totalTokens:u.total_tokens};
}

export function createOpenAIProvider(config,{allowPaidApi=false,fetchImpl,readApiKey,onEvent=async()=>{},sleep=delay}={}) {
  if(!allowPaidApi)throw failure('disabled');
  const c=validateOpenAIConfig(config),isMockNetwork=fetchImpl!==undefined;
  const transport=fetchImpl??globalThis.fetch;
  invariant(typeof transport==='function','Node.js 22+ fetch is required');
  const getKey=readApiKey??(()=>process.env.OPENAI_API_KEY);
  const request={...buildResponsesRequest(Object.fromEntries(['provider','model','knowledgeCutoff','maxOutputTokens','networkEnabled'].map(k=>[k,c[k]]))),reasoning:{effort:c.reasoningEffort}};
  const body=JSON.stringify(request);
  invariant(Buffer.byteLength(body)<=4096,'Request exceeds the frozen input byte budget');
  // Reserve every attempt at full output capacity, including timeouts and failed requests.
  // Never refund reservations or infer that an uncertain attempt was free.
  const perAttemptMicros=Math.ceil(INPUT_TOKEN_RESERVE*c.inputUsdPerMillion+c.maxOutputTokens*c.outputUsdPerMillion);
  const costLimitMicros=Math.floor(c.maxEstimatedCostUsd*1e6);
  let busy=false,blocked=false,attempts=0,reservedOutputTokens=0,reservedMicros=0;
  const snapshot=()=>({attempts,reservedOutputTokens,reservedEstimatedUsd:reservedMicros/1e6,inputTokenReservePerAttempt:INPUT_TOKEN_RESERVE,scope:'provider_instance_or_single_cli_run',billingGuarantee:false});
  async function emit(event){try{await onEvent({...event,budget:snapshot()});}catch{blocked=true;throw failure('audit_failed');}}
  return Object.freeze({
    budget:snapshot,
    async propose(){
      if(busy)throw failure('concurrent_call');busy=true;
      try {
        if(blocked)throw failure('budget_exhausted');
        if(attempts>=c.maxAttempts||reservedOutputTokens+c.maxOutputTokens>c.maxTotalOutputTokens||reservedMicros+perAttemptMicros>costLimitMicros)throw failure('budget_exhausted');
        const key=getKey(); // Lazy: only the explicitly enabled server path reads this one variable.
        if(!key)throw failure('missing_key');
        if(typeof key!=='string'||key.length>1024||/[\s\x00-\x1f\x7f]/.test(key))throw failure('invalid_key');
        for(let retry=0;retry<=c.maxRetries;retry++){
          if(attempts>=c.maxAttempts||reservedOutputTokens+c.maxOutputTokens>c.maxTotalOutputTokens||reservedMicros+perAttemptMicros>costLimitMicros)throw failure('budget_exhausted');
          attempts++;reservedOutputTokens+=c.maxOutputTokens;reservedMicros+=perAttemptMicros;
          await emit({type:'provider_attempt_started',attempt:attempts,model:c.model,requestHash:await digest(request),at:new Date().toISOString()});
          let result;
          try{result=await requestOnce(transport,body,key,c.timeoutMs);}catch(e){await emit({type:'provider_attempt_failed',attempt:attempts,code:e.code});throw e;}
          const {status,payload}=result;
          if(!result.ok){
            const errorCode=payload?.error?.code;
            const quota=['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'].includes(errorCode);
            const retryable=!quota&&(status===429||[500,502,503,504].includes(status));
            await emit({type:'provider_attempt_failed',attempt:attempts,code:quota?'quota_exhausted':'http_error',status});
            if(!retryable||retry===c.maxRetries)throw failure(quota?'quota_exhausted':'http_error',{status});
            const waitMs=retryDelay(result.retryAfter,retry+1);
            await sleep(waitMs);continue;
          }
          let list,usage;
          try{
            usage=validatedUsage(payload,c.maxOutputTokens);
            if(payload?.status!=='completed')throw failure('incomplete');
            if(payload.output?.some(x=>x?.type==='message'&&x.content?.some(y=>y?.type==='refusal')))throw failure('refused');
            try{list=parseResponses(payload);}catch{throw failure('invalid_output');}
          }catch(e){if(e.code==='invalid_usage')blocked=true;await emit({type:'provider_attempt_failed',attempt:attempts,code:e.code||'invalid_output',...(usage?{usage}:{})});throw e instanceof ProviderError?e:failure('invalid_output');}
          const provenance={provider:'openai',transport:isMockNetwork?'mock-http':'openai-http',model:c.model,modelCalled:!isMockNetwork,knowledgeCutoff:c.knowledgeCutoff,accountAccess:isMockNetwork?'unverified':'request-succeeded-only',requestHash:await digest(request),usage,budget:snapshot()};
          await emit({type:'provider_candidates_accepted',attempt:attempts,provenance,candidates:list});
          return {candidates:list,provenance};
        }
      }finally{busy=false;}
    }
  });
}

export async function runOpenAIResearch(provider,options={}) {
  exactKeys(options,Object.keys(options));
  invariant(Object.keys(options).every(k=>['seed','costs','createdAt'].includes(k)),'Evaluator overrides are not allowed');
  const proposed=await provider.propose();
  const report=await runResearch({...options,list:proposed.candidates,provider:'openai'});
  report.providerRun=proposed.provenance;
  report.protocol.proposal={requestHash:proposed.provenance.requestHash,model:proposed.provenance.model,knowledgeCutoff:proposed.provenance.knowledgeCutoff,transport:proposed.provenance.transport};
  report.frozen.protocolHash=await digest(report.protocol);
  report.evidence.modelCalled=proposed.provenance.modelCalled;
  report.evidence.modelKnowledgeCutoff=proposed.provenance.knowledgeCutoff;
  report.evidence.modelAccountAccess=proposed.provenance.accountAccess;
  return report;
}
