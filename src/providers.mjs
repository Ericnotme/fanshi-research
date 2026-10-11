import {candidates, validateCandidates, exactKeys, invariant} from './core.mjs';
export const PROVIDER_EXAMPLE = Object.freeze({provider:'mock',model:'gpt-6-astra',knowledgeCutoff:'2026-04-30',maxOutputTokens:2048,networkEnabled:false});
export const candidateSchema={type:'object',additionalProperties:false,required:['candidates'],properties:{candidates:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,required:['kind','lookback','threshold'],properties:{kind:{type:'string',enum:['momentum','mean_reversion']},lookback:{type:'integer',enum:[5,10,20,40]},threshold:{type:'integer',enum:[0]}}}}}};
export function buildResponsesRequest(config=PROVIDER_EXAMPLE) {
  exactKeys(config,['provider','model','knowledgeCutoff','maxOutputTokens','networkEnabled']);
  invariant(config.provider==='mock'||config.provider==='openai-contract-only','Unsupported provider');
  invariant(typeof config.model==='string'&&/^[a-z0-9][a-z0-9.-]{1,79}$/.test(config.model),'Invalid model ID');
  invariant(config.networkEnabled===false,'Built-in network transport is intentionally unavailable');
  invariant(Number.isInteger(config.maxOutputTokens)&&config.maxOutputTokens>=256&&config.maxOutputTokens<=4096,'Output budget must be 256–4096');
  invariant(typeof config.knowledgeCutoff==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(config.knowledgeCutoff),'Record a model knowledge cutoff');
  return {model:config.model,store:false,max_output_tokens:config.maxOutputTokens,input:[{role:'system',content:'Propose at most eight unique candidates using only the supplied schema. No code, tools, tickers, dates, prices, news or outcomes. Do not claim profitability.'},{role:'user',content:'Return bounded momentum and mean-reversion lookback hypotheses for a synthetic research demonstration.'}],text:{format:{type:'json_schema',name:'strategy_candidates',strict:true,schema:candidateSchema}}};
}
export function parseCandidateText(text) {
  invariant(typeof text==='string'&&new TextEncoder().encode(text).length<=16384,'Output too large');
  const parsed=JSON.parse(text);exactKeys(parsed,['candidates']);return validateCandidates(parsed.candidates);
}
export function parseResponses(response) {
  invariant(response&&response.status==='completed','Provider response not completed');
  invariant(Array.isArray(response.output),'Missing output');
  const contents=response.output.filter(x=>x.type==='message').flatMap(x=>x.content||[]);
  invariant(!contents.some(x=>x.type==='refusal'),'Provider refused');
  const texts=contents.filter(x=>x.type==='output_text').map(x=>x.text);
  invariant(texts.length===1,'Expected exactly one structured output');return parseCandidateText(texts[0]);
}
export async function propose(config=PROVIDER_EXAMPLE, mockTransport) {
  const request=buildResponsesRequest(config);
  if(config.provider==='mock') return {candidates:candidates(),provenance:'deterministic-mock',modelCalled:false};
  invariant(typeof mockTransport==='function','Contract-only provider needs an explicitly supplied test transport; no API connection is installed');
  const response=await mockTransport(request);
  return {candidates:parseResponses(response),provenance:'injected-transport-unverified',modelCalled:false};
}
