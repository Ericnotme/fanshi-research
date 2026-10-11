/** Pure, shared evaluator. No network, dynamic code or account data. */
export const VERSION = '0.2.0';
export const LIMIT = 8;
export const LOOKBACKS = Object.freeze([5, 10, 20, 40]);
export const KINDS = Object.freeze(['momentum', 'mean_reversion']);
export function invariant(ok, message) { if (!ok) throw new Error(message); }
export function exactKeys(value, keys) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  invariant(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'Unknown or missing fields');
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  invariant(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'Non-finite value');
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
export function validateCandidate(c) {
  exactKeys(c, ['kind', 'lookback', 'threshold']);
  invariant(KINDS.includes(c.kind), 'Unsupported strategy kind');
  invariant(LOOKBACKS.includes(c.lookback), 'Lookback outside fixed budget');
  invariant(c.threshold === 0, 'Only the frozen zero threshold is allowed in v0.1');
  return {kind:c.kind, lookback:c.lookback, threshold:c.threshold};
}
export function candidateId(c) { return `${c.kind}-${c.lookback}`; }
export function candidates() { return KINDS.flatMap(kind => LOOKBACKS.map(lookback => ({kind, lookback, threshold:0}))); }
export function validateCandidates(items) {
  invariant(Array.isArray(items) && items.length > 0 && items.length <= LIMIT, 'Candidate budget must be 1–8');
  const out = items.map(validateCandidate);
  invariant(new Set(out.map(candidateId)).size === out.length, 'Duplicate candidate');
  return out;
}
export function syntheticData(seed = 42, count = 720) {
  invariant(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'Seed must be uint32');
  invariant(Number.isInteger(count) && count >= 120 && count <= 2000, 'Bar count must be 120–2000');
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) + 0.5) / 4294967296;
  let price = 100;
  const bars = [];
  for (let i = 0; i < count; i++) {
    // Artificial regimes; day numbers intentionally are not historical dates.
    const regime = Math.floor(i / 120) % 3;
    const drift = [0.0006, -0.0005, 0][regime];
    const noise = (random() + random() + random() - 1.5) * 0.025;
    const shock = i > 0 && i % 173 === 0 ? -0.10 : 0;
    if (i) price *= Math.exp(drift + noise + shock);
    bars.push({t:i, close:Number(price.toFixed(8))});
  }
  return {source:'synthetic', generator:'lcg-regimes-v1', seed, bars};
}
export function validateBars(bars) {
  invariant(Array.isArray(bars) && bars.length >= 3 && bars.length <= 2000, 'Invalid bar count');
  let previous = -Infinity;
  for (const b of bars) {
    exactKeys(b, ['t','close']);
    invariant(Number.isSafeInteger(b.t) && b.t > previous, 'Bars must have strictly increasing integer times');
    invariant(Number.isFinite(b.close) && b.close > 0 && b.close <= 1e12, 'Prices must be finite and positive');
    previous = b.t;
  }
}
export function validateCosts(cost) {
  exactKeys(cost, ['feeBps', 'slippageBps']);
  invariant([cost.feeBps,cost.slippageBps].every(x => Number.isFinite(x) && x >= 0 && x <= 100), 'Each cost must be 0–100 bps per side');
  return cost;
}
export function weights(bars, candidate) {
  validateBars(bars); validateCandidate(candidate);
  return bars.map((_, i) => {
    // Return i is close[i-1] -> close[i]. Signal uses close[i-2] at latest,
    // allowing one full bar to execute at close[i-1]. No same-close fill.
    const signal = i - 2, start = signal - candidate.lookback;
    if (start < 0) return 0;
    const trend = bars[signal].close / bars[start].close - 1;
    return candidate.kind === 'momentum' ? Number(trend > 0) : Number(trend < 0);
  });
}
export function simulate(bars, targetWeights, start, end, costs = {feeBps:5, slippageBps:3}) {
  validateBars(bars); validateCosts(costs);
  invariant(Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end <= bars.length && end > start, 'Invalid evaluation interval');
  invariant(Array.isArray(targetWeights) && targetWeights.length === bars.length && targetWeights.every(w=>w===0 || w===1), 'Only long or cash weights');
  let equity=1, gross=1, peak=1, drawdown=0, held=0, costPaid=0, turns=0, exposed=0;
  const curve=[{t:bars[start-1].t, equity:1, gross:1, drawdown:0}], ledger=[];
  const rate=(costs.feeBps+costs.slippageBps)/10000;
  for(let i=start;i<end;i++) {
    const target=targetWeights[i], turnover=Math.abs(target-held), paid=equity*turnover*rate;
    if(turnover) { ledger.push({kind:'simulated_fill',executeAt:bars[i-1].t,signalAt:i>=2?bars[i-2].t:null,side:target?'enter':'exit',weight:target,price:bars[i-1].close,costInInitialUnits:paid}); turns++; }
    const r=bars[i].close/bars[i-1].close-1;
    equity=(equity-paid)*(1+target*r); gross*=1+target*r; costPaid+=paid;
    held=target; exposed+=target; peak=Math.max(peak,equity); drawdown=Math.max(drawdown,1-equity/peak);
    curve.push({t:bars[i].t,equity,gross,drawdown:1-equity/peak});
  }
  // Every separately scored segment starts in cash and liquidates at its end.
  if(held) {
    const paid=equity*rate; equity-=paid; costPaid+=paid; turns++;
    ledger.push({kind:'simulated_fill',executeAt:bars[end-1].t,signalAt:null,side:'liquidate',weight:0,price:bars[end-1].close,costInInitialUnits:paid});
    drawdown=Math.max(drawdown,1-equity/peak);
    curve[curve.length-1]={...curve.at(-1),equity,drawdown:1-equity/peak};
  }
  return {netReturn:equity-1,grossReturn:gross-1,maxDrawdown:drawdown,costPaid,costDrag:gross-equity,turnoverLegs:turns,exposure:exposed/(end-start),bars:end-start,curve,ledger};
}
function compact(metrics) { const {curve,ledger,...rest}=metrics; return rest; }
export function score(metrics) { return metrics.netReturn - 0.5*metrics.maxDrawdown; }
export function splits(count) {
  invariant(Number.isInteger(count)&&count>=240&&count<=2000, 'Research requires 240–2000 bars');
  const trainEnd=Math.floor(count*0.5), validationEnd=Math.floor(count*0.75);
  return {train:[42,trainEnd],validation:[trainEnd+2,validationEnd],test:[validationEnd+2,count],gapBars:2};
}
export function developmentEvaluation(bars, list, costs) {
  const split=splits(bars.length);
  const records=validateCandidates(list).map(candidate=>{
    const w=weights(bars,candidate);
    return {candidate,id:candidateId(candidate),train:compact(simulate(bars,w,...split.train,costs)),validation:compact(simulate(bars,w,...split.validation,costs))};
  });
  // A fixed development rule, frozen before test: train top 3, positive
  // validation return and <=20% validation drawdown, then validation score.
  const top=new Set([...records].sort((a,b)=>score(b.train)-score(a.train)||a.id.localeCompare(b.id)).slice(0,3).map(x=>x.id));
  for(const r of records) {r.eligible=top.has(r.id)&&r.validation.netReturn>0&&r.validation.maxDrawdown<=0.20; r.reason=!top.has(r.id)?'outside_train_top3':r.validation.netReturn<=0?'nonpositive_validation':r.validation.maxDrawdown>0.20?'validation_drawdown_limit':'eligible';}
  const chosen=[...records].filter(x=>x.eligible).sort((a,b)=>score(b.validation)-score(a.validation)||a.id.localeCompare(b.id))[0]||null;
  return {split,records,selected:chosen?.candidate||null};
}
export function rollingOrigin(bars, list, costs) {
  // Development-only folds all end before the final held-out segment.
  const last=splits(bars.length).validation[1], result=[];
  for(const fraction of [0.45,0.60,0.75]) {
    const end=Math.floor(last*fraction), evalStart=end+2, evalEnd=Math.min(last,evalStart+Math.floor(last*0.14));
    const ranking=validateCandidates(list).map(c=>({candidate:c,id:candidateId(c),train:compact(simulate(bars,weights(bars,c),42,end,costs))})).sort((a,b)=>score(b.train)-score(a.train)||a.id.localeCompare(b.id));
    const chosen=ranking[0].candidate;
    result.push({train:[42,end],evaluate:[evalStart,evalEnd],selected:chosen,allTrainScores:ranking,metrics:compact(simulate(bars,weights(bars,chosen),evalStart,evalEnd,costs)),status:'development_diagnostic'});
  }
  return result;
}
export async function runResearch({seed=42,costs={feeBps:5,slippageBps:3},list=candidates(),createdAt=new Date().toISOString(),provider='mock'}={}) {
  validateCosts(costs); list=validateCandidates(list);
  invariant(['mock','openai-contract-only','openai'].includes(provider), 'Unknown provider provenance');
  invariant(!Number.isNaN(Date.parse(createdAt)), 'Invalid freeze time');
  const data=syntheticData(seed), development=developmentEvaluation(data.bars,list,costs);
  const protocol={engine:VERSION,dataSource:'synthetic',seed,bars:data.bars.length,candidates:list,costs,split:development.split,signalLagBars:2,selection:'train_top3_then_positive_validation_drawdown_lte_20_then_net_minus_half_drawdown',maxCandidates:LIMIT,provider};
  const frozen={frozenAt:createdAt,protocolHash:await digest(protocol),strategyHash:await digest(development.selected||{kind:'cash'}),dataHash:await digest(data),selected:development.selected};
  const selectedWeights=development.selected?weights(data.bars,development.selected):data.bars.map(()=>0);
  const test=simulate(data.bars,selectedWeights,...development.split.test,costs);
  const benchmark=simulate(data.bars,data.bars.map(()=>1),...development.split.test,costs);
  const sensitivity=[0,1,2,4].map(multiplier=>({multiplier,...compact(simulate(data.bars,selectedWeights,...development.split.test,{feeBps:costs.feeBps*multiplier/4,slippageBps:costs.slippageBps*multiplier/4}))}));
  // Above scenarios are 0x, .25x, .5x, 1x; stress costs below cap separately.
  const stressCosts={feeBps:Math.min(100,costs.feeBps*2),slippageBps:Math.min(100,costs.slippageBps*2)};
  const feeScenarios=sensitivity.map(x=>({...x,multiplier:x.multiplier/4}));
  feeScenarios.push({multiplier:2,capped:costs.feeBps*2>100||costs.slippageBps*2>100,...compact(simulate(data.bars,selectedWeights,...development.split.test,stressCosts))});
  return {schemaVersion:1,engineVersion:VERSION,createdAt,data,protocol,frozen,candidates:development.records,selected:development.selected,test,benchmarks:{buyAndHold:benchmark,cash:{netReturn:0,maxDrawdown:0}},feeScenarios,rolling:rollingOrigin(data.bars,list,costs),evidence:{kind:'synthetic_demo',historicalOutOfSample:'not_claimed',knowledgeContamination:'Historical time splits do not remove LLM pretraining knowledge; this fixture is synthetic.',previousResearch:'2022 H2 and Q4 were repeatedly studied and are overlapping development data, not unseen samples.',modelKnowledgeCutoff:provider==='openai-contract-only'?'2026-04-30':'not_applicable_mock',prospectiveStatus:'prospective-pending',prospectiveObservations:0,profitValidated:false,modelCalled:false,deviceValidated:false},warning:'All returns are synthetic simulation. No claim of investment performance.'};
}
export function allocatePrize(pool, weightsList) {
  invariant(Number.isSafeInteger(pool)&&pool>=0&&pool<=1e9,'Pool must be integer demo credits, 0–1 billion');
  invariant(Array.isArray(weightsList)&&weightsList.length>=1&&weightsList.length<=20,'1–20 participants');
  invariant(weightsList.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000),'Weights must be nonnegative bounded integers');
  const total=weightsList.reduce((a,b)=>a+b,0); invariant(total>0,'At least one positive weight');
  const rows=weightsList.map((weight,index)=>{const numerator=BigInt(pool)*BigInt(weight);return {participant:index+1,weight,credits:Number(numerator/BigInt(total)),remainder:Number(numerator%BigInt(total))};});
  let remainder=pool-rows.reduce((s,r)=>s+r.credits,0);
  const order=[...rows].sort((a,b)=>b.remainder-a.remainder||a.participant-b.participant);
  for(let i=0;i<remainder;i++)order[i].credits++;
  return {kind:'fixed_prize_pool',unit:'demo_credits',pool,totalAllocated:rows.reduce((s,r)=>s+r.credits,0),rows:rows.map(({remainder,...r})=>r),rule:'largest_remainder_ties_by_participant_index',investmentReturn:null};
}
