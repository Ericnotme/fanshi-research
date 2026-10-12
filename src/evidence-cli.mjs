import {readFile} from 'node:fs/promises';
import {compareEvidence} from './evidence.mjs';
import {appendJournal} from './log.mjs';

const [file='examples/evidence.json',visibility,removedOrigin] = process.argv.slice(2);
const journal='runtime/evidence-checks.jsonl';
try {
  const bytes=await readFile(file);
  if(bytes.length>1000000) throw Error('Input exceeds the 1 MB limit');
  const input=JSON.parse(bytes.toString('utf8'));
  if(visibility!==undefined) input.visibility=visibility;
  if(removedOrigin!==undefined) input.excludedOrigins=[removedOrigin];
  const report=await compareEvidence(input);
  await appendJournal(journal,{type:'evidence_check_completed',hashes:report.selected.hashes,
    baselineHashes:report.baseline.hashes,change:report.change,result:report.selected.result,
    at:new Date().toISOString()});
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  await appendJournal(journal,{type:'evidence_check_failed',code:'input_or_audit_failure',at:new Date().toISOString()}).catch(()=>{});
  // No input text, file path, source excerpt or parser message in errors.
  console.error('Evidence check failed: validate the synthetic input and local journal. No result was accepted.');
  process.exitCode=1;
}
