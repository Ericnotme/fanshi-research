import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {checkEvidence,compareEvidence,validateClaim,validateEvidenceDataset} from '../src/evidence.mjs';
import {readJournal} from '../src/log.mjs';
const seed=JSON.parse(await readFile(new URL('../examples/evidence.json',import.meta.url),'utf8'));
const input=()=>structuredClone(seed);
const one=()=>{const x=input();x.dataset.observations=x.dataset.observations.slice(0,1);return x;};

test('public evidence supports the confirmed metric; removing its origin makes it unknown',async()=>{
  const x=input();x.excludedOrigins=['issuer-report'];const r=await compareEvidence(x);
  assert.equal(r.baseline.result.status,'supported');assert.equal(r.selected.result.status,'unknown');
  assert.equal(r.change.conclusionChanged,true);assert.equal(r.selected.result.supportingOrigins.length,0);
  assert.deepEqual(r.change.changedEvidence.map(x=>x.id),['revenue-original','revenue-repost']);
});
test('reposts never add weight or a second independent origin; removal covers all copies',async()=>{
  const x=one(),a=await checkEvidence(x);x.dataset.observations.push(input().dataset.observations[1]);
  for(let i=0;i<10;i++){
    x.dataset.sources.push({...x.dataset.sources[1],id:`copy-${i}`});
    x.dataset.observations.push({...x.dataset.observations[1],id:`copy-${i}`,sourceId:`copy-${i}`});
  }
  const b=await checkEvidence(x);assert.equal(b.result.status,a.result.status);assert.equal(b.result.uniqueOrigins,1);
  assert.deepEqual(b.result.supportingOrigins,a.result.supportingOrigins);
  x.excludedOrigins=['issuer-report'];assert.equal((await checkEvidence(x)).result.status,'unknown');
});
test('missing availability is excluded; no synthetic check authorizes a trade',async()=>{
  const x=one();x.dataset.observations[0].availableAt=null;const r=await checkEvidence(x);
  assert.equal(r.result.status,'unknown');assert.equal(r.result.trace[0].reason,'missing_time');
  assert.equal(r.result.trace[0].included,false);assert.equal(r.boundary.tradeEligible,false);
  assert.equal((await checkEvidence(one())).boundary.tradeEligible,false);
});
test('conflicting complete measurements remain visible and unknown; switching to public-only resolves this fixture',async()=>{
  const x=input();x.visibility='all';const all=await checkEvidence(x),pub=await checkEvidence({...x,visibility:'public'});
  assert.equal(all.result.status,'unknown');assert.equal(all.result.reason,'conflicting_evidence');
  assert.ok(all.result.conflicts.some(x=>x.evidenceIds.includes('revenue-conflict')));assert.equal(pub.result.status,'supported');
  const minus=await compareEvidence({...x,excludedOrigins:['synthetic-note']});assert.equal(minus.selected.result.status,'supported');
});
test('future records are excluded by event, publication and availability time',async()=>{
  const x=one();x.dataset.observations[0].availableAt='2026-07-11T00:00:00.000Z';
  let r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(r.result.trace[0].reason,'future_evidence');
  x.dataset.observations[0].publishedAt='2026-07-11T00:00:00.000Z';r=await checkEvidence(x);assert.equal(r.result.status,'unknown');
  x.dataset.observations[0].occurredAt='2026-07-11T00:00:00.000Z';assert.equal((await checkEvidence(x)).result.status,'unknown');
});
test('same input versions yield byte-identical reports and hashes without a model or key',async()=>{
  const a=await compareEvidence(input()),b=await compareEvidence(input());assert.deepEqual(a,b);
  assert.equal(a.selected.boundary.modelCalled,false);assert.equal(a.selected.boundary.alphaValidated,false);
});
test('missing numeric values remain null, distinct from an explicitly measured zero',async()=>{
  const x=one();x.dataset.observations[0].value=null;let r=await checkEvidence(x);
  assert.equal(r.result.status,'unknown');assert.equal(r.result.trace[0].value,null);
  x.dataset.observations[0].value=0;r=await checkEvidence(x);assert.equal(r.result.status,'refuted');
});
test('lower bounds below the threshold are unknown, never negative evidence',async()=>{
  const x=one();x.dataset.observations[0].value=70;x.dataset.observations[0].coverage='lower_bound';
  assert.equal((await checkEvidence(x)).result.status,'unknown');
  x.dataset.observations[0].value=120;assert.equal((await checkEvidence(x)).result.status,'supported');
});
test('adoption, signing, acceptance and cash never stand in for recognized revenue',async()=>{
  for(const stage of ['adoption','signed','accepted','cash_received']){
    const x=one();x.dataset.observations[0].stage=stage;const r=await checkEvidence(x);
    assert.equal(r.result.status,'unknown');assert.equal(r.result.trace[0].reason,'different_metric_stage_or_period');
  }
});
test('AI claim candidates and unconfirmed extractions cannot produce accepted conclusions',async()=>{
  const x=one();x.claim.confirmation='ai_candidate';assert.equal((await checkEvidence(x)).result.reason,'claim_unconfirmed');
  x.claim.confirmation='human_confirmed';x.dataset.observations[0].confirmation='ai_candidate';
  const r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(r.result.trace[0].reason,'unconfirmed_extraction');
});
test('unavailable revisions preserve old knowledge; a known correction supersedes original and repost',async()=>{
  const x=input();x.dataset.observations=x.dataset.observations.slice(0,2);
  x.dataset.observations.push({...x.dataset.observations[0],id:'revenue-v2',sourceVersion:2,value:70,
    publishedAt:'2026-07-11T00:00:00.000Z',availableAt:'2026-07-11T00:00:00.000Z'});
  const before=await checkEvidence(x);assert.equal(before.result.status,'supported');
  const after=await checkEvidence({...x,asOf:'2026-07-12T00:00:00.000Z'});assert.equal(after.result.status,'refuted');
  assert.equal(after.result.trace.find(x=>x.id==='revenue-repost').reason,'superseded_as_of');
  assert.notEqual(before.hashes.protocol,after.hashes.protocol);
});
test('incompatible exact totals conflict even when both pass the threshold; a lower bound is compatible',async()=>{
  const x=one(),node=x.dataset.provenance.find(node=>node.originId==='independent-audit');
  x.dataset.sources.push({id:'audit',originId:node.originId,title:'合成独立核对',visibility:node.visibility,url:node.url,provenanceId:node.id});
  x.dataset.observations.push({...x.dataset.observations[0],id:'second-total',sourceId:'audit',value:130});
  assert.equal((await checkEvidence(x)).result.reason,'conflicting_evidence');
  x.dataset.observations[1].coverage='lower_bound';x.dataset.observations[1].value=110;
  assert.equal((await checkEvidence(x)).result.status,'supported');
});
test('strict schemas reject unlicensed real data, extra fields, broken dates and invalid source references',async()=>{
  const x=input();assert.throws(()=>validateClaim({...x.claim,apiKey:'not-used'}));
  assert.throws(()=>validateEvidenceDataset({...x.dataset,kind:'real'}));
  for(const patch of [{publishedAt:'2026-02-30T00:00:00.000Z'},{availableAt:'2026-01-01T00:00:00.000Z'},
    {sourceId:'missing'},{value:'120'},{value:NaN},{sourceVersion:0},{order:'buy'}]){
    const y=one();Object.assign(y.dataset.observations[0],patch);await assert.rejects(checkEvidence(y));
  }
  await assert.rejects(checkEvidence({...x,excludedOrigins:['unknown-origin']}));
  await assert.rejects(compareEvidence({...x,order:'buy'}));
  await assert.rejects(checkEvidence({...x,excludedOrigins:null}));
});
test('input edits during async hashing cannot mix protocol versions',async()=>{
  const x=input(),pending=compareEvidence(x);x.claim.threshold=999;x.dataset.observations[0].value=0;
  const r=await pending;assert.equal(r.selected.claim.threshold,100);assert.equal(r.selected.result.status,'supported');
  assert.deepEqual(r.selected.hashes.dataset,r.baseline.hashes.dataset);
});
test('CLI runs with an empty environment and records failures alongside successful checks',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'evidence-cli-'));
  try{
    const script=new URL('../src/evidence-cli.mjs',import.meta.url).pathname;
    const file=new URL('../examples/evidence.json',import.meta.url).pathname;
    const run=args=>spawnSync(process.execPath,[script,...args],{cwd:dir,env:{},encoding:'utf8',timeout:5000});
    const ok=run([file,'public','issuer-report']);assert.equal(ok.status,0,ok.stderr);assert.equal(JSON.parse(ok.stdout).selected.result.status,'unknown');
    const bad=run([file,'bad']);assert.equal(bad.status,1);
    const journal=await readJournal(path.join(dir,'runtime/evidence-checks.jsonl'));
    assert.deepEqual(journal.map(x=>x.event.type),['evidence_check_completed','evidence_check_failed']);
  }finally{await rm(dir,{recursive:true,force:true});}
});
