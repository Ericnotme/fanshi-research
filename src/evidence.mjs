/** Deterministic evidence checks. No model, network, pricing or trading path. */
import {exactKeys, invariant, digest} from './core.mjs';
import {syntheticProvenanceRegistry} from './synthetic-provenance.mjs';

export const EVIDENCE_ENGINE = 'evidence-check/0.2.0';
export const EVIDENCE_STAGES = Object.freeze(['adoption', 'signed', 'accepted', 'recognized_revenue', 'cash_received']);
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,79}$/.test(value);
const nonempty = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const hashId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const syntheticLocator = value => value === null || (typeof value === 'string' && /^https:\/\/example\.invalid\/[a-z0-9/_-]+$/.test(value));
function time(value, nullable = false) {
  if (nullable && value === null) return;
  invariant(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Use an exact UTC timestamp or explicit null');
}
function period(item) {
  time(item.periodStart); time(item.periodEnd);
  invariant(item.periodStart <= item.periodEnd, 'Invalid metric period');
}
function metricFields(item) {
  invariant(identifier(item.entity) && identifier(item.metric) && identifier(item.unit), 'Invalid entity, metric or unit ID');
  invariant(EVIDENCE_STAGES.includes(item.stage), 'Keep adoption, signing, acceptance, revenue and cash separate');
  period(item);
}
export function validateClaim(claim) {
  exactKeys(claim, ['id','version','confirmation','thesis','entity','metric','stage','periodStart','periodEnd','operator','threshold','unit','falsification']);
  invariant(identifier(claim.id) && Number.isSafeInteger(claim.version) && claim.version > 0, 'Invalid claim identity/version');
  invariant(['human_confirmed','ai_candidate'].includes(claim.confirmation), 'Claim must be confirmed by a human or marked as a candidate');
  invariant(nonempty(claim.thesis) && nonempty(claim.falsification), 'Specify a thesis and falsification condition');
  metricFields(claim);
  invariant(claim.operator === 'gte' && Number.isFinite(claim.threshold) && claim.threshold >= 0 && claim.threshold <= 1e12, 'MVP supports a nonnegative, bounded >= metric threshold');
  return claim;
}
export function validateEvidenceDataset(data) {
  exactKeys(data, ['schemaVersion','id','version','kind','sources','observations','provenance']);
  invariant(data.schemaVersion === 2 && identifier(data.id) && Number.isSafeInteger(data.version) && data.version > 0, 'Require dataset schema 2 and a valid version');
  invariant(data.kind === 'synthetic', 'This MVP accepts synthetic fixtures only');
  invariant(Array.isArray(data.sources) && data.sources.length > 0 && data.sources.length <= 100, 'Require 1–100 sources');
  invariant(Array.isArray(data.observations) && data.observations.length <= 1000, 'At most 1000 evidence records');
  invariant(Array.isArray(data.provenance) && data.provenance.length <= 300, 'At most 300 provenance nodes');
  const nodeIds = new Set();
  for (const node of data.provenance) {
    exactKeys(node, ['id','kind','parentId','originId','visibility','url']);
    invariant(hashId(node.id) && !nodeIds.has(node.id), 'Invalid or duplicate provenance node'); nodeIds.add(node.id);
    invariant(['primary','repost','ai'].includes(node.kind), 'Require an explicit provenance role');
    invariant(node.parentId === null || hashId(node.parentId), 'Invalid parent hash');
    invariant(node.originId === null || identifier(node.originId), 'Invalid provenance origin');
    invariant(['public','private'].includes(node.visibility) && syntheticLocator(node.url), 'Invalid synthetic provenance metadata');
  }
  const sources = new Map();
  for (const source of data.sources) {
    exactKeys(source, ['id','originId','title','visibility','url','provenanceId']);
    invariant(identifier(source.id) && identifier(source.originId) && !sources.has(source.id), 'Invalid or duplicate source ID');
    invariant(nonempty(source.title, 160) && ['public','private'].includes(source.visibility), 'Invalid source description/visibility');
    // Reserved example.invalid links only: fixtures must not impersonate actual issuers.
    invariant(syntheticLocator(source.url) && hashId(source.provenanceId), 'Require a synthetic locator and provenance hash');
    sources.set(source.id, source);
  }
  const ids = new Set(), versions = new Set();
  for (const item of data.observations) {
    exactKeys(item, ['id','sourceId','sourceVersion','confirmation','entity','metric','stage','periodStart','periodEnd','value','unit','coverage','occurredAt','publishedAt','availableAt','excerpt']);
    invariant(identifier(item.id) && !ids.has(item.id) && sources.has(item.sourceId), 'Invalid evidence ID or source reference'); ids.add(item.id);
    invariant(Number.isSafeInteger(item.sourceVersion) && item.sourceVersion > 0, 'Invalid source version');
    invariant(['human_confirmed','ai_candidate'].includes(item.confirmation), 'Unreviewed extraction must remain an AI candidate');
    metricFields(item);
    invariant(item.value === null || (Number.isFinite(item.value) && item.value >= 0 && item.value <= 1e12), 'Unknown values must be null; known values must be bounded numbers');
    invariant(['complete','lower_bound'].includes(item.coverage) && nonempty(item.excerpt, 1500), 'Record scope and a short synthetic excerpt');
    for (const key of ['occurredAt','publishedAt','availableAt']) time(item[key], true);
    if (item.occurredAt !== null && item.publishedAt !== null) invariant(item.occurredAt <= item.publishedAt, 'Publication precedes the observed event');
    if (item.publishedAt !== null && item.availableAt !== null) invariant(item.publishedAt <= item.availableAt, 'Availability cannot precede publication');
    if (item.occurredAt !== null) invariant(item.occurredAt >= item.periodEnd, 'A period total cannot be observed before that period ends');
    const versionKey = [item.sourceId, item.sourceVersion, ...matchKeys.map(key => item[key])].join('|');
    invariant(!versions.has(versionKey), 'Duplicate metric in one source version'); versions.add(versionKey);
  }
  return data;
}
const matchKeys = ['entity','metric','stage','periodStart','periodEnd','unit'];
const matches = (a, b) => matchKeys.every(key => a[key] === b[key]);
const contradictory = (a,b) => a.coverage === 'complete' && b.coverage === 'complete' ? a.value !== b.value :
  a.coverage === 'complete' ? a.value < b.value : b.coverage === 'complete' ? b.value < a.value : false;

// Content-addressed parent references detect in-place role/lineage edits. Root pins live
// outside the request. Neither an origin label nor human confirmation can register roots.
async function resolveProvenance(dataset, registry) {
  const nodes = new Map(dataset.provenance.map(node => [node.id,node]));
  const validHashes = new Set();
  for (const {id,...body} of dataset.provenance) if (await digest(body) === id) validHashes.add(id);
  const resolved = new Map();
  for (const source of dataset.sources) {
    const chain = [], seen = new Set(); let next = source.provenanceId, reason = null;
    while (next !== null) {
      if (seen.has(next)) { reason = 'provenance_cycle'; break; }
      seen.add(next);
      const node = nodes.get(next);
      if (!node) { reason = 'provenance_missing_parent'; break; }
      chain.push(node); next = node.parentId;
    }
    const leaf = chain[0], root = chain.at(-1);
    if (!reason && chain.some(node => !validHashes.has(node.id))) reason = 'provenance_hash_mismatch';
    if (!reason && chain.some((node,i) => i < chain.length-1 ? node.kind === 'primary' || node.originId !== null : node.kind !== 'primary')) reason = 'provenance_invalid_parent';
    if (!reason && !registry.roots.some(pin => pin.nodeId === root.id && pin.originId === root.originId)) reason = 'provenance_unregistered_root';
    if (!reason && (source.url !== leaf.url || source.visibility !== leaf.visibility)) reason = 'provenance_metadata_mismatch';
    resolved.set(source.id,{reason,kind:leaf?.kind??null,originId:reason?null:root.originId,
      chain:chain.map(node=>({id:node.id,kind:node.kind,parentId:node.parentId})),
      visibility:chain.some(node=>node.visibility==='private')?'private':'public'});
  }
  return resolved;
}

function validateRequest(options) {
  invariant(options && typeof options === 'object' && !Array.isArray(options), 'Expected a check request');
  const allowed=['claim','dataset','asOf','visibility','excludedOrigins'];
  invariant(Object.keys(options).every(key=>allowed.includes(key)) && ['claim','dataset','asOf'].every(key=>Object.hasOwn(options,key)), 'Unknown or missing request fields');
  invariant(options.excludedOrigins === undefined || Array.isArray(options.excludedOrigins), 'Excluded origins must be an array');
}
export async function checkEvidence(options) {
  validateRequest(options);
  let {claim, dataset, asOf, visibility = 'public', excludedOrigins = []}=options;
  // Snapshot inputs before the first await: later caller edits cannot change a running check.
  claim = structuredClone(claim); dataset = structuredClone(dataset); excludedOrigins = [...excludedOrigins];
  validateClaim(claim); validateEvidenceDataset(dataset); time(asOf);
  invariant(['public','all'].includes(visibility), 'Visibility must be public or all');
  const sources = new Map(dataset.sources.map(source => [source.id, source]));
  const registry = syntheticProvenanceRegistry(), provenance = await resolveProvenance(dataset,registry);
  const origins = new Set(registry.roots.map(pin => pin.originId));
  invariant(excludedOrigins.every(id => origins.has(id)) && new Set(excludedOrigins).size === excludedOrigins.length, 'Unknown or duplicate excluded origin');
  excludedOrigins.sort();
  const trace = [], usable = [];
  for (const item of [...dataset.observations].sort((a,b) => a.id.localeCompare(b.id))) {
    const source = sources.get(item.sourceId);
    const lineage = provenance.get(source.id);
    let reason = null;
    if (lineage.reason) reason = lineage.reason;
    else if (excludedOrigins.includes(lineage.originId)) reason = 'source_removed';
    else if (visibility === 'public' && lineage.visibility !== 'public') reason = 'private_source_excluded';
    else if (!matches(item, claim)) reason = 'different_metric_stage_or_period';
    else if (item.confirmation !== 'human_confirmed') reason = 'unconfirmed_extraction';
    else if ([item.occurredAt,item.publishedAt,item.availableAt].some(t => t === null)) reason = 'missing_time';
    else if ([item.occurredAt,item.publishedAt,item.availableAt].some(t => t > asOf)) reason = 'future_evidence';
    // Derived prose is always a trace, never primary factual support, even after review.
    else if (lineage.kind !== 'primary') reason = 'derived_not_independent';
    const row = {id:item.id, sourceId:item.sourceId, originId:lineage.originId, declaredOriginId:source.originId,
      provenance:{kind:lineage.kind,verified:!lineage.reason,chain:lineage.chain}, sourceVersion:item.sourceVersion,
      availableAt:item.availableAt, publishedAt:item.publishedAt, occurredAt:item.occurredAt, reason, included:reason === null,
      value:item.value, coverage:item.coverage, recordHash:await digest(item)};
    trace.push(row); if (reason === null) usable.push({item, source, row});
  }
  // Select revisions only after as-of filtering. An unavailable correction never erases older knowledge.
  for (const entry of usable) {
    if (usable.some(other => other.source.id === entry.source.id && other.item.sourceVersion > entry.item.sourceVersion)) {
      entry.row.included = false; entry.row.reason = 'superseded_as_of';
    }
  }
  // The root identity is resolved from the pinned chain, never source.originId.
  for (const entry of usable.filter(x => x.row.included)) {
    if (usable.some(other => other.row.included && other.row.originId === entry.row.originId && other.item.sourceVersion > entry.item.sourceVersion)) {
      entry.row.included = false; entry.row.reason = 'superseded_as_of';
    }
  }
  // Keep derived traces informative, but never let a copy supply a missing primary record.
  for (const row of trace.filter(row=>row.reason==='derived_not_independent')) {
    const primaries = usable.filter(entry=>entry.row.included && entry.row.originId===row.originId);
    if (!primaries.length) row.reason = 'missing_primary_evidence';
    else if (primaries.some(entry=>entry.item.sourceVersion>row.sourceVersion)) row.reason = 'superseded_as_of';
  }
  const active = usable.filter(x => x.row.included);
  const unknown = active.filter(x => x.item.value === null);
  for (const entry of unknown) entry.row.reason = 'unknown_value';
  const known = active.filter(x => x.item.value !== null);
  const conflicts = [];
  for (let i=0; i<known.length; i++) for (let j=i+1; j<known.length; j++) {
    if (contradictory(known[i].item, known[j].item)) conflicts.push({evidenceIds:[known[i].item.id,known[j].item.id], reason:'incompatible_measurements'});
  }
  const grouped = new Map();
  for (const entry of active) {
    if (!grouped.has(entry.row.originId)) grouped.set(entry.row.originId, []);
    grouped.get(entry.row.originId).push(entry);
  }
  const assessments = [...grouped].sort(([a],[b])=>a.localeCompare(b)).map(([originId, entries]) => {
    const values = entries.map(x=>x.item).filter(x=>x.value!==null);
    const hasSupport = values.some(x => x.value >= claim.threshold);
    const hasRefutation = values.some(x => x.coverage === 'complete' && x.value < claim.threshold);
    return {originId,evidenceIds:entries.map(x=>x.item.id),result:hasSupport && hasRefutation ? 'unknown' : hasSupport ? 'supported' : hasRefutation ? 'refuted' : 'unknown'};
  });
  let status = 'unknown', reason = 'insufficient_evidence';
  if (claim.confirmation !== 'human_confirmed') reason = 'claim_unconfirmed';
  else if (conflicts.length) reason = 'conflicting_evidence';
  else if (assessments.some(x=>x.result==='supported')) { status = 'supported'; reason = 'threshold_met'; }
  else if (assessments.some(x=>x.result==='refuted')) { status = 'refuted'; reason = 'complete_measurement_below_threshold'; }
  const protocol = {engine:EVIDENCE_ENGINE,registryVersion:registry.version,asOf,visibility,excludedOrigins,
    decision:'pinned synthetic primary roots only; AI/reposts are trace-only; no-voting; exact metric/period/stage; complete totals required for refutation; conflict means unknown'};
  const result = {status,reason,conflicts,origins:assessments,uniqueOrigins:assessments.length,
    supportingOrigins:assessments.filter(x=>x.result==='supported').map(x=>x.originId),
    refutingOrigins:assessments.filter(x=>x.result==='refuted').map(x=>x.originId),trace};
  return {schemaVersion:2,kind:'synthetic_evidence_check',engine:EVIDENCE_ENGINE,claim,dataset,registry,protocol,result,
    hashes:{claim:await digest(claim),dataset:await digest(dataset),registry:await digest(registry),protocol:await digest(protocol),result:await digest(result)},
    boundary:{causalAttribution:false,alphaValidated:false,returnForecast:false,tradeEligible:false,modelCalled:false,
      note:'Only registered synthetic primary roots count. Confirmation reviews a claim/extraction; it cannot establish source independence. Hash chains are not proof of real provenance or independent institutions, signatures, external timestamps or tamper-proof storage. Editing files/registry or falsely linking known roots is outside this local verifier trust boundary. No reliable text-based forgery detection is claimed.'}};
}

export async function compareEvidence(options) {
  validateRequest(options);
  // Freeze both counterfactual views to the same claim, data and cutoff.
  const frozen = structuredClone(options);
  const baseline = await checkEvidence({...frozen, excludedOrigins:[]});
  const selected = await checkEvidence(frozen);
  const prior = new Map(baseline.result.trace.map(row => [row.id,row]));
  const changedEvidence = selected.result.trace.filter(row => {
    const before = prior.get(row.id); return row.included !== before.included || row.reason !== before.reason;
  }).map(row=>({id:row.id,before:prior.get(row.id).reason,after:row.reason}));
  return {baseline,selected,change:{from:baseline.result.status,to:selected.result.status,
    conclusionChanged:baseline.result.status!==selected.result.status,reasonChanged:baseline.result.reason!==selected.result.reason,
    removedOrigins:selected.protocol.excludedOrigins,changedEvidence,
    interpretation:'Source-removal sensitivity under a fixed rule; not a causal effect or return forecast.'}};
}
