import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from '../src/core.mjs';
import {checkEvidence,compareEvidence} from '../src/evidence.mjs';
import {syntheticProvenanceRegistry} from '../src/synthetic-provenance.mjs';

const seed=JSON.parse(await readFile(new URL('../examples/evidence.json',import.meta.url),'utf8'));
const one=()=>{const x=structuredClone(seed);x.dataset.observations=x.dataset.observations.slice(0,1);return x;};
const rootNode=(x,origin='issuer-report')=>x.dataset.provenance.find(node=>node.originId===origin);
async function addDerived(x,{id,kind='ai',parentId=rootNode(x).id,originId=`renamed-${id}`,confirmation='human_confirmed'}){
  const body={kind,parentId,originId:null,visibility:'public',url:`https://example.invalid/derived/${id}`};
  const node={id:await digest(body),...body};x.dataset.provenance.push(node);
  x.dataset.sources.push({id,originId,title:'合成重复转述',visibility:body.visibility,url:body.url,provenanceId:node.id});
  x.dataset.observations.push({...x.dataset.observations[0],id,sourceId:id,confirmation,excerpt:'【合成重复回答】同一报告的再次转述，没有新的原始记录。'});
  return node;
}
function addIndependent(x){
  const node=rootNode(x,'independent-audit');
  x.dataset.sources.push({id:'independent',originId:'misleading-label',title:'独立合成原始核对',visibility:node.visibility,url:node.url,provenanceId:node.id});
  x.dataset.observations.push({...x.dataset.observations[0],id:'independent',sourceId:'independent'});
}
const row=(r,id)=>r.result.trace.find(row=>row.id===id);

test('ten renamed human-confirmed AI answers remain derived; removing the actual root removes every answer',async()=>{
  const x=one();for(let i=0;i<10;i++)await addDerived(x,{id:`answer-${i}`});
  const r=await compareEvidence({...x,excludedOrigins:['issuer-report']});
  assert.equal(r.baseline.result.status,'supported');assert.equal(r.baseline.result.uniqueOrigins,1);
  assert.equal(r.baseline.result.trace.filter(row=>row.reason==='derived_not_independent').length,10);
  assert.equal(r.selected.result.status,'unknown');assert.equal(r.selected.result.uniqueOrigins,0);
  for(let i=0;i<10;i++){
    const trace=row(r.selected,`answer-${i}`);assert.equal(trace.reason,'source_removed');
    assert.equal(trace.originId,'issuer-report');assert.equal(trace.provenance.kind,'ai');
    assert.equal(trace.declaredOriginId,`renamed-answer-${i}`);assert.equal(trace.provenance.chain.length,2);
  }
  const snapshot=JSON.stringify(x.dataset.provenance);x.claim.confirmation='ai_candidate';
  assert.equal((await checkEvidence(x)).result.reason,'claim_unconfirmed');
  x.claim.confirmation='human_confirmed';x.claim.version++;
  assert.equal((await checkEvidence({...x,excludedOrigins:['issuer-report']})).result.status,'unknown');
  assert.equal(JSON.stringify(x.dataset.provenance),snapshot);
});

test('ten groundless confirmed AI answers cannot manufacture root support',async()=>{
  const x=one();for(let i=0;i<10;i++)await addDerived(x,{id:`answer-${i}`,parentId:'f'.repeat(64)});
  x.dataset.observations.shift();const r=await checkEvidence(x);
  assert.equal(r.result.status,'unknown');assert.equal(r.result.uniqueOrigins,0);
  assert.ok(r.result.trace.every(row=>row.reason==='provenance_missing_parent'&&!row.included&&row.originId===null));
});

test('recomputed hashes and a primary label cannot register ten new roots',async()=>{
  const x=one();
  for(let i=0;i<10;i++){
    const node=await addDerived(x,{id:`fake-${i}`});
    Object.assign(node,{kind:'primary',parentId:null,originId:`fake-root-${i}`});
    const {id,...body}=node;node.id=await digest(body);x.dataset.sources.at(-1).provenanceId=node.id;
  }
  x.dataset.observations.shift();const r=await checkEvidence(x);
  assert.equal(r.result.status,'unknown');assert.equal(r.result.uniqueOrigins,0);
  assert.ok(r.result.trace.every(row=>row.reason==='provenance_unregistered_root'));
});

test('an existing provenance identity cannot silently change role or parent, even after human confirmation',async()=>{
  const x=one(),node=await addDerived(x,{id:'answer'});
  node.kind='primary';node.parentId=null;node.originId='invented-root';
  x.dataset.observations.shift();const r=await checkEvidence(x);
  assert.equal(r.result.status,'unknown');assert.equal(row(r,'answer').reason,'provenance_hash_mismatch');
  assert.equal(row(r,'answer').provenance.verified,false);
});

test('self-cycles and multi-node parent cycles fail closed with a visible cycle reason',async()=>{
  for(const self of [true,false]){
    const x=one(),a=await addDerived(x,{id:'cycle-a'});
    const b=self?a:await addDerived(x,{id:'cycle-b',parentId:a.id});a.parentId=b.id;
    x.dataset.observations.shift();const r=await checkEvidence(x);
    assert.equal(r.result.status,'unknown');assert.equal(r.result.uniqueOrigins,0);
    assert.ok(r.result.trace.every(row=>row.reason==='provenance_cycle'&&!row.included));
  }
});

test('missing intermediate nodes, missing roots and missing leaf nodes all remain unknown',async()=>{
  for(const missing of ['intermediate','root','leaf']){
    const x=one(),a=await addDerived(x,{id:'middle'}),b=await addDerived(x,{id:'leaf',parentId:a.id});
    const id=missing==='intermediate'?a.id:missing==='root'?rootNode(x).id:b.id;
    x.dataset.provenance=x.dataset.provenance.filter(node=>node.id!==id);
    x.dataset.observations=x.dataset.observations.filter(item=>item.id==='leaf');
    const r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(r.result.uniqueOrigins,0);
    assert.equal(row(r,'leaf').reason,'provenance_missing_parent');
  }
});

test('a derived leaf with no primary terminal cannot become a root',async()=>{
  const x=one();await addDerived(x,{id:'orphan',parentId:null});x.dataset.observations.shift();
  const r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(row(r,'orphan').reason,'provenance_invalid_parent');
});

test('multiple generations of reposts and AI summaries resolve to one actual primary root',async()=>{
  const x=one();let parent=rootNode(x).id;
  for(let i=0;i<10;i++)parent=(await addDerived(x,{id:`generation-${i}`,kind:i%2?'ai':'repost',parentId:parent})).id;
  const r=await checkEvidence(x);assert.equal(r.result.uniqueOrigins,1);assert.equal(r.result.status,'supported');
  assert.equal(row(r,'generation-9').provenance.chain.length,11);
  assert.equal(row(r,'generation-9').originId,'issuer-report');
  assert.equal((await checkEvidence({...x,excludedOrigins:['issuer-report']})).result.uniqueOrigins,0);
});

test('a valid chain alone cannot supply missing, future or unconfirmed primary evidence',async()=>{
  for(const mode of ['missing','future','unconfirmed','missing-time']){
    const x=one();await addDerived(x,{id:'summary'});
    if(mode==='missing')x.dataset.observations.shift();
    if(mode==='future')x.dataset.observations[0].availableAt='2026-07-20T00:00:00.000Z';
    if(mode==='unconfirmed')x.dataset.observations[0].confirmation='ai_candidate';
    if(mode==='missing-time')x.dataset.observations[0].availableAt=null;
    const r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(r.result.uniqueOrigins,0);
    assert.equal(row(r,'summary').reason,'missing_primary_evidence');
  }
});

test('private ancestry cannot be laundered through a public AI summary or renamed root metadata',async()=>{
  const x=one();x.dataset.observations=[structuredClone(seed.dataset.observations.find(item=>item.id==='revenue-conflict'))];
  await addDerived(x,{id:'public-summary',parentId:rootNode(x,'synthetic-note').id});
  let r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(row(r,'public-summary').reason,'private_source_excluded');
  const primary=x.dataset.sources.find(source=>source.id==='private-note');primary.visibility='public';
  r=await checkEvidence(x);assert.equal(r.result.status,'unknown');assert.equal(row(r,'revenue-conflict').reason,'provenance_metadata_mismatch');
});

test('two separately registered traceable synthetic primary roots count separately; deletion leaves exactly one',async()=>{
  const x=one();addIndependent(x);const r=await compareEvidence({...x,excludedOrigins:['issuer-report']});
  assert.equal(r.baseline.result.uniqueOrigins,2);assert.equal(r.baseline.result.status,'supported');
  assert.deepEqual(r.baseline.result.supportingOrigins,['independent-audit','issuer-report']);
  assert.equal(r.selected.result.status,'supported');assert.equal(r.selected.result.uniqueOrigins,1);
  assert.deepEqual(r.selected.result.supportingOrigins,['independent-audit']);
  assert.equal((await checkEvidence({...x,excludedOrigins:['issuer-report','independent-audit']})).result.status,'unknown');
});

test('renaming a primary label or duplicating a primary pointer cannot invent another independent root',async()=>{
  const x=one();x.dataset.sources[0].originId='renamed-primary';
  for(let i=0;i<10;i++){
    x.dataset.sources.push({...x.dataset.sources[0],id:`alias-${i}`,originId:`new-label-${i}`});
    x.dataset.observations.push({...x.dataset.observations[0],id:`alias-${i}`,sourceId:`alias-${i}`});
  }
  const r=await compareEvidence({...x,excludedOrigins:['issuer-report']});
  assert.equal(r.baseline.result.uniqueOrigins,1);assert.equal(r.selected.result.status,'unknown');
  assert.ok(r.selected.result.trace.every(row=>row.reason==='source_removed'));
});

test('exports preserve registry, full parent chain and exclusion reasons and replay with identical hashes',async()=>{
  const x=one();await addDerived(x,{id:'answer'});x.excludedOrigins=['issuer-report'];
  const exported=JSON.parse(JSON.stringify(await compareEvidence(x))),saved=exported.selected;
  const replay=await checkEvidence({claim:saved.claim,dataset:saved.dataset,asOf:saved.protocol.asOf,
    visibility:saved.protocol.visibility,excludedOrigins:saved.protocol.excludedOrigins});
  assert.deepEqual(replay,saved);assert.deepEqual(saved.registry,syntheticProvenanceRegistry());
  assert.equal(saved.hashes.registry,await digest(saved.registry));assert.equal(saved.schemaVersion,2);
  assert.equal(row(saved,'answer').provenance.chain.length,2);assert.equal(saved.boundary.tradeEligible,false);
  const registry=syntheticProvenanceRegistry();registry.roots.push({originId:'invented',nodeId:'a'.repeat(64)});
  assert.notDeepEqual(registry,syntheticProvenanceRegistry());
  await assert.rejects(checkEvidence({...x,registry}));
});

test('old schema and duplicate provenance IDs cannot be silently upgraded or overwrite a parent',async()=>{
  const x=one();x.dataset.schemaVersion=1;await assert.rejects(checkEvidence(x));
  x.dataset.schemaVersion=2;x.dataset.provenance.push({...rootNode(x),kind:'ai'});await assert.rejects(checkEvidence(x));
});

test('a derived version number or altered value cannot supersede a primary measurement',async()=>{
  const x=one();await addDerived(x,{id:'invented-correction'});
  x.dataset.observations.at(-1).sourceVersion=999;x.dataset.observations.at(-1).value=0;
  const r=await checkEvidence(x);assert.equal(r.result.status,'supported');assert.equal(r.result.uniqueOrigins,1);
  assert.equal(row(r,'revenue-original').included,true);assert.equal(row(r,'invented-correction').reason,'derived_not_independent');
  assert.equal(r.result.conflicts.length,0);
});
