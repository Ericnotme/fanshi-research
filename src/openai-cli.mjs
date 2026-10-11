// Deliberately separate from the offline CLI/MCP/browser entrypoints.
import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {createOpenAIProvider,runOpenAIResearch,validateOpenAIConfig,ProviderError} from './openai.mjs';
import {appendJournal} from './log.mjs';
import {syntheticData,invariant} from './core.mjs';
const journal='runtime/openai-experiments.jsonl';
const [mode,configFile='examples/openai.json',seedText='42',...extra]=process.argv.slice(2);
let lock;
try {
  invariant(extra.length===0&&['--dry-run','--allow-paid-api'].includes(mode),'Use --dry-run or explicitly --allow-paid-api');
  const seed=Number(seedText);syntheticData(seed,240);
  const bytes=await readFile(configFile);invariant(bytes.length<=16384,'Configuration too large');
  const config=validateOpenAIConfig(JSON.parse(bytes.toString('utf8')));
  if(mode==='--dry-run'){
    console.log(JSON.stringify({mode:'dry-run',networkCalled:false,keyRead:false,config,accountAccess:'unverified',endToEndValidated:false},null,2));
  }else{
    await mkdir('runtime',{recursive:true});
    lock=await open('runtime/openai-run.lock','wx');
    const onEvent=event=>appendJournal(journal,event);
    const provider=createOpenAIProvider(config,{allowPaidApi:true,onEvent});
    await onEvent({type:'openai_research_started',at:new Date().toISOString(),config,seed});
    const report=await runOpenAIResearch(provider,{seed});
    await onEvent({type:'research_completed',report});
    await writeFile('runtime/latest-openai-report.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({report:'runtime/latest-openai-report.json',journal,budget:provider.budget(),evidence:report.evidence},null,2));
  }
}catch(error){
  // Never print network error bodies, request headers or arbitrary exception messages.
  const failure=error instanceof ProviderError?{code:error.code,message:error.message,details:error.details}:{code:'configuration_or_local_io_error',message:'Check command arguments, public config and local journal locks; no raw error content is printed.'};
  if(lock)await appendJournal(journal,{type:'research_failed',...failure,at:new Date().toISOString()}).catch(()=>{});
  console.error(JSON.stringify(failure));process.exitCode=1;
}finally{if(lock){await lock.close();await unlink('runtime/openai-run.lock');}}
