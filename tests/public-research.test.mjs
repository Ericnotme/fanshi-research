import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkEvidence} from '../src/evidence.mjs';
const caseFile=JSON.parse(await readFile(new URL('../examples/public-phone-pricing.json',import.meta.url),'utf8'));
const synthetic=JSON.parse(await readFile(new URL('../examples/evidence.json',import.meta.url),'utf8'));

test('the public case cannot enter the synthetic evaluator or claim a return test',async()=>{
  assert.equal(caseFile.kind,'public_source_research_case');
  await assert.rejects(checkEvidence({...synthetic,dataset:caseFile}));
  assert.equal(caseFile.boundary.automatedEvidenceEngineUsed,false);
  assert.equal(caseFile.boundary.historicalSignalEligible,false);
  assert.equal(caseFile.boundary.priceOnlyAblationRun,false);
  assert.equal(caseFile.boundary.alphaValidated,false);assert.equal(caseFile.boundary.tradeEligible,false);
});

test('every claim links through unique fact IDs to a primary document and unambiguous page',()=>{
  const facts=new Map(caseFile.facts.map(fact=>[fact.id,fact])),sources=new Map(caseFile.sources.map(source=>[source.id,source]));
  assert.equal(facts.size,caseFile.facts.length);assert.equal(sources.size,caseFile.sources.length);
  for(const claim of caseFile.claims)for(const parent of claim.parentEvidenceIds){
    const fact=facts.get(parent);assert.ok(fact);assert.equal(sources.get(fact.sourceId).role,'primary_company_disclosure');
    assert.equal(fact.locator.pdfPage,fact.locator.pdfIndex+1);
  }
  assert.equal(new Set(caseFile.facts.filter(f=>f.id.startsWith('xiaomi-')).map(f=>f.sourceId)).size,1);
  assert.equal(sources.get('caixin-discovery').access,'public_abstract_only');
});

test('financial periods never substitute for unverified first-public timestamps',()=>{
  for(const source of caseFile.sources){
    assert.equal(source.firstPublicAt,null);assert.equal(source.documentSha256,null);
    assert.ok(source.firstPublicTimeBasis.length>0);assert.ok(Number.isFinite(Date.parse(source.observedAt)));
    if(source.publicationDate)assert.ok(source.publicationDate<source.observedAt.slice(0,10));
  }
  const xiaomi=caseFile.sources.find(s=>s.id==='xiaomi-interim-2026');
  assert.equal(xiaomi.publicationDate,null);assert.equal(xiaomi.documentDated,'2026-08-18');
  for(const fact of caseFile.facts.filter(f=>f.sourceId===xiaomi.id))assert.equal(fact.period,'2026-01-01/2026-06-30');
});

test('the counterexample uses matching periods and margins; forward contracts do not become realized returns',()=>{
  const fact=id=>caseFile.facts.find(f=>f.id===id),asp=fact('xiaomi-asp'),margin=fact('xiaomi-margin');
  assert.equal(asp.period,margin.period);assert.equal(asp.baselinePeriod,margin.baselinePeriod);
  assert.ok(asp.current>asp.baseline);assert.ok(margin.current<margin.baseline);
  assert.equal(Math.round((asp.current/asp.baseline-1)*1000)/10,asp.reportedChangePct);
  assert.equal(Math.round((margin.current-margin.baseline)*10)/10,-2.7);
  assert.equal(fact('xiaomi-shipments').reportedChangePct,-22.9);
  assert.equal(caseFile.claims.find(c=>c.id==='price-proves-profit').basis,'counterexample_to_sufficiency');
  assert.equal(caseFile.claims.find(c=>c.id==='repricing-alpha').status,'unknown');
  assert.equal(fact('micron-sca').stage,'signed');assert.equal(fact('micron-hbm').stage,'signed');
  assert.equal(fact('micron-hbm').kind,'contract_status_and_forward_looking_statement');
});
