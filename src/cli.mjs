import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {runResearch,allocatePrize} from './core.mjs';
import {appendJournal,readJournal} from './log.mjs';
import {buildResponsesRequest,PROVIDER_EXAMPLE} from './providers.mjs';
const [command='demo',arg='42']=process.argv.slice(2);
const journal='runtime/experiments.jsonl';
try {
  if(command==='demo'){
    await mkdir('runtime',{recursive:true});
    const report=await runResearch({seed:Number(arg)});const record=await appendJournal(journal,{type:'research_completed',report});
    await writeFile('runtime/latest-report.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({report:'runtime/latest-report.json',journal,sequence:record.sequence,selected:report.selected,evidence:report.evidence},null,2));
  }else if(command==='verify-log'){
    console.log(JSON.stringify({valid:true,records:(await readJournal(journal)).length}));
  }else if(command==='prize'){
    console.log(JSON.stringify(allocatePrize(Number(arg),[5,3,2]),null,2));
  }else if(command==='provider-request'){
    const config=arg==='42'?PROVIDER_EXAMPLE:JSON.parse(await readFile(arg,'utf8'));console.log(JSON.stringify(buildResponsesRequest(config),null,2));
  }else{throw new Error('Commands: demo [seed], verify-log, prize [integer credits], provider-request [config file]');}
}catch(error){
  await appendJournal(journal,{type:'research_failed',command:['demo','verify-log','prize','provider-request'].includes(command)?command:'unknown',reason:error.message,at:new Date().toISOString()}).catch(()=>{});
  console.error(error.message);process.exitCode=1;
}
