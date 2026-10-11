import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {createOpenAIProvider,runOpenAIResearch,validateOpenAIConfig} from '../src/openai.mjs';
import {candidates,runResearch,digest} from '../src/core.mjs';
import {appendJournal,readJournal} from '../src/log.mjs';
const config=JSON.parse(await readFile(new URL('../examples/openai.json',import.meta.url),'utf8'));
const key='unit-test-placeholder'; // Deliberately not a real credential.
const payload=(delta={})=>({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({candidates:candidates().slice(0,3)})}]}],usage:{input_tokens:300,output_tokens:200,total_tokens:500},...delta});
const response=(body=payload(),status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
const make=(fetchImpl,delta={},options={})=>createOpenAIProvider({...config,...delta},{allowPaidApi:true,readApiKey:()=>key,fetchImpl,sleep:async()=>{},...options});
const rejectsCode=(promise,code)=>assert.rejects(promise,e=>e.code===code);

test('OpenAI path requires explicit opt-in; config never accepts keys/endpoints/expanded limits',()=>{
  assert.throws(()=>createOpenAIProvider(config),e=>e.code==='disabled');
  for(const delta of [{apiKey:key},{baseURL:'https://example.com'},{provider:'mock'},{networkEnabled:false},{model:'../bad'},{maxRetries:3},{maxAttempts:4},{maxOutputTokens:4097},{maxEstimatedCostUsd:0},{reasoningEffort:'unbounded'}])assert.throws(()=>validateOpenAIConfig({...config,...delta}));
});
test('real HTTP request shape is fixed, schema constrained, stateless and tool-free',async()=>{
  let seen;const p=make(async(url,init)=>{seen={url,init};return response();});const r=await p.propose();
  assert.equal(seen.url,'https://api.openai.com/v1/responses');assert.equal(seen.init.method,'POST');assert.equal(seen.init.redirect,'error');assert.equal(seen.init.headers.Authorization,`Bearer ${key}`);
  const body=JSON.parse(seen.init.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(body.reasoning.effort,'low');assert.equal(body.max_output_tokens,2048);assert.equal(body.tools,undefined);assert.equal(body.previous_response_id,undefined);
  assert.equal(r.candidates.length,3);assert.equal(r.provenance.modelCalled,false);assert.equal(r.provenance.accountAccess,'unverified');assert.equal(r.provenance.transport,'mock-http');assert.equal(r.provenance.requestHash,await digest(body));assert(!JSON.stringify(r).includes(key));
});
test('missing/invalid key refuses before network; constructor and budget rejection never read key',async()=>{
  let reads=0,calls=0;const p=make(async()=>{calls++;},{maxEstimatedCostUsd:.001},{readApiKey:()=>{reads++;return key;}});
  assert.equal(reads,0);await rejectsCode(p.propose(),'budget_exhausted');assert.equal(reads,0);
  for(const bad of [undefined,'with\nnewline']){const client=make(async()=>{calls++;},{},{readApiKey:()=>bad});await rejectsCode(client.propose(),bad?'invalid_key':'missing_key');}
  assert.equal(calls,0);
});
test('429 and transient server errors retry with bounded backoff and reserve each attempt',async()=>{
  let calls=0;const waits=[],events=[];const p=make(async()=>{calls++;return calls===1?response({error:{code:'rate_limit_exceeded'}},429,{'retry-after':'0.5'}):response();},{},{sleep:async ms=>waits.push(ms),onEvent:async e=>events.push(e)});
  await p.propose();assert.equal(calls,2);assert.deepEqual(waits,[500]);assert.equal(p.budget().reservedOutputTokens,4096);assert.equal(p.budget().reservedEstimatedUsd,.36864);assert.equal(events.filter(e=>e.type==='provider_attempt_failed').length,1);
  await rejectsCode(p.propose(),'budget_exhausted');assert.equal(calls,2);
  let serverCalls=0;await make(async()=>++serverCalls===1?response({},503):response()).propose();assert.equal(serverCalls,2);
});
test('retry count, total request budget, token budget and estimated USD budget independently stop calls',async()=>{
  for(const delta of [{maxRetries:0},{maxAttempts:1},{maxTotalOutputTokens:2048},{maxEstimatedCostUsd:.2}]){
    let calls=0;const p=make(async()=>{calls++;return response({},500);},delta);
    await assert.rejects(p.propose());assert.equal(calls,1);assert.equal(p.budget().attempts,1);
  }
  let calls=0;const p=make(async()=>{calls++;return response({},502);},{maxRetries:2,maxAttempts:3,maxTotalOutputTokens:6144,maxEstimatedCostUsd:1});await rejectsCode(p.propose(),'http_error');assert.equal(calls,3);
});
test('quota, authentication, permission, bad request and redirects are not retried or echoed',async()=>{
  for(const [status,code] of [[401,'invalid_api_key'],[403,'permission_denied'],[400,'invalid_request'],[302,'redirect'],[429,'insufficient_quota'],[429,'project_spend_limit_exceeded']]){
    let calls=0;const p=make(async()=>{calls++;return response({error:{code,message:key}},status);});
    try{await p.propose();assert.fail();}catch(e){assert.equal(e.code,status===429?'quota_exhausted':'http_error');assert(!JSON.stringify(e).includes(key));assert(!e.message.includes(key));}assert.equal(calls,1);
  }
});
test('long Retry-After stops rather than retrying earlier than server requested',async()=>{
  let calls=0,sleeps=0;const p=make(async()=>{calls++;return response({},429,{'retry-after':'60'});},{},{sleep:async()=>{sleeps++;}});await rejectsCode(p.propose(),'retry_delay_exceeded');assert.equal(calls,1);assert.equal(sleeps,0);
});
test('timeouts cover fetch and body reading, abort and never retry uncertain execution',async()=>{
  for(const phase of ['fetch','body']){
    let signal,calls=0;const p=make(async(_url,init)=>{calls++;signal=init.signal;return phase==='fetch'?new Promise(()=>{}):new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));}}));},{timeoutMs:10});
    await rejectsCode(p.propose(),'timeout');assert.equal(signal.aborted,true);assert.equal(calls,1);assert.equal(p.budget().reservedOutputTokens,2048);
  }
});
test('network exceptions are sanitized and never retried',async()=>{
  let calls=0;const p=make(async()=>{calls++;throw Error(`sensitive ${key}`);});try{await p.propose();assert.fail();}catch(e){assert.equal(e.code,'network_error');assert(!e.message.includes(key));assert(!JSON.stringify(e).includes(key));}assert.equal(calls,1);
});
test('response size limit covers declared and streaming payloads',async()=>{
  for(const headers of [{},{'content-length':'70000'}]){let calls=0;const p=make(async()=>{calls++;return new Response('x'.repeat(70000),{headers});});await rejectsCode(p.propose(),'oversized_response');assert.equal(calls,1);}
});
test('invalid JSON, incomplete response and refusal fail closed without retry',async()=>{
  const cases=[[()=>new Response('{broken'),'invalid_json'],[()=>response(payload({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}})),'incomplete'],[()=>response(payload({output:[{type:'message',content:[{type:'refusal',refusal:key}]}]})),'refused']];
  for(const [fixture,code]of cases){let calls=0;const p=make(async()=>{calls++;return fixture();});await rejectsCode(p.propose(),code);assert.equal(calls,1);}
});
test('unknown strategy fields, extra output, duplicates, invalid lookbacks and tool calls fail closed',async()=>{
  const cases=[{candidates:[{...candidates()[0],code:'evaluateThis()'}]},{candidates:[candidates()[0],candidates()[0]]},{candidates:[{...candidates()[0],lookback:100}]},{candidates:candidates(),profit:100}];
  for(const invalid of cases){const data=payload();data.output[1].content[0].text=JSON.stringify(invalid);await rejectsCode(make(async()=>response(data)).propose(),'invalid_output');}
  for(const extra of [{type:'function_call',name:'trade'},{type:'message',role:'user',content:[{type:'output_text',text:'{}'}]}]){const data=payload();data.output.push(extra);await rejectsCode(make(async()=>response(data)).propose(),'invalid_output');}
});
test('missing or excessive usage blocks subsequent requests; reasoning counted in output budget',async()=>{
  for(const usage of [null,{input_tokens:1,output_tokens:3000,total_tokens:3001},{input_tokens:9000,output_tokens:2,total_tokens:9002},{input_tokens:1,output_tokens:1,total_tokens:5}]){
    let calls=0;const p=make(async()=>{calls++;return response(payload({usage}));});await rejectsCode(p.propose(),'invalid_usage');await rejectsCode(p.propose(),'budget_exhausted');assert.equal(calls,1);
  }
});
test('provider snapshots config and rejects concurrent budget races',async()=>{
  const source={...config};let finish;const p=createOpenAIProvider(source,{allowPaidApi:true,readApiKey:()=>key,fetchImpl:()=>new Promise(resolve=>{finish=resolve;})});source.maxOutputTokens=4000;
  const pending=p.propose();await rejectsCode(p.propose(),'concurrent_call');while(!finish)await new Promise(resolve=>setImmediate(resolve));finish(response());await pending;assert.equal(p.budget().reservedOutputTokens,2048);
});
test('audit failure prevents request; logs contain no keys, raw bodies or refusal content',async()=>{
  let called=false;const p=make(async()=>{called=true;return response();},{},{onEvent:async()=>{throw Error(key);}});await rejectsCode(p.propose(),'audit_failed');assert.equal(called,false);
  const events=[];await make(async()=>response(),{},{onEvent:async e=>events.push(e)}).propose();assert(!JSON.stringify(events).includes(key));assert(events.some(e=>e.type==='provider_candidates_accepted'));
});
test('model proposals use the same local evaluator and retain synthetic/pending provenance',async()=>{
  const createdAt='2026-10-11T04:00:00.000Z';const actual=await runOpenAIResearch(make(async()=>response()),{createdAt});
  const expected=await runResearch({list:candidates().slice(0,3),createdAt,provider:'openai'});
  assert.deepEqual(actual.test,expected.test);assert.deepEqual(actual.candidates,expected.candidates);assert.equal(actual.frozen.protocolHash,await digest(actual.protocol));assert.equal(actual.evidence.modelCalled,false);assert.equal(actual.evidence.profitValidated,false);assert.equal(actual.evidence.prospectiveStatus,'prospective-pending');assert.equal(actual.evidence.modelAccountAccess,'unverified');
  await assert.rejects(runOpenAIResearch(make(async()=>response()),{list:candidates()}));
});
test('failed and successful HTTP attempts are preserved in a verifiable journal',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'fanshi-provider-'));const file=path.join(dir,'events.jsonl');let calls=0;
  try{await make(async()=>++calls===1?response({},503):response(),{},{onEvent:e=>appendJournal(file,e)}).propose();const records=await readJournal(file);assert.equal(records.length,4);assert.equal(records[1].event.type,'provider_attempt_failed');assert.equal(records[3].event.type,'provider_candidates_accepted');assert(!(await readFile(file,'utf8')).includes(key));}finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI dry-run needs no key, opt-in is mandatory and an empty key never reaches network',async()=>{
  const root=new URL('..',import.meta.url);const entry=new URL('../src/openai-cli.mjs',import.meta.url);const configPath=new URL('../examples/openai.json',import.meta.url);const dir=await mkdtemp(path.join(os.tmpdir(),'fanshi-cli-'));
  try{
    const run=args=>spawnSync(process.execPath,[entry.pathname,...args],{cwd:dir,env:{},encoding:'utf8',timeout:5000});
    const dry=run(['--dry-run',configPath.pathname]);assert.equal(dry.status,0);assert.equal(JSON.parse(dry.stdout).keyRead,false);assert.equal(JSON.parse(dry.stdout).networkCalled,false);
    assert.equal(run([]).status,1);const missing=run(['--allow-paid-api',configPath.pathname]);assert.equal(missing.status,1);assert.equal(JSON.parse(missing.stderr).code,'missing_key');assert.equal((await readJournal(path.join(dir,'runtime/openai-experiments.jsonl'))).at(-1).event.type,'research_failed');
  }finally{await rm(dir,{recursive:true,force:true});}
});
