import {compareEvidence} from '../src/evidence.mjs';
// EVIDENCE_EXAMPLE is embedded from the reviewed synthetic JSON by build.mjs.
const evState={input:structuredClone(EVIDENCE_EXAMPLE),report:null,sequence:0,history:[]};
const evStages={adoption:'采用',signed:'签约',accepted:'验收',recognized_revenue:'确认收入',cash_received:'回款'};
const evStatus={supported:'成立',refuted:'不成立',unknown:'未知'};
const evReasons={threshold_met:'已有证据达到人工确认的数值门槛。',complete_measurement_below_threshold:'完整期间总量低于门槛，满足否证条件。',insufficient_evidence:'现有可用证据不足，不能把缺失当成零。',claim_unconfirmed:'命题仍是候选，等待人工确认。',conflicting_evidence:'同一指标、期间和口径存在矛盾证据，尚不能得出结论。',source_removed:'来源及同源转载已删除',private_source_excluded:'当前仅使用公开样例',different_metric_stage_or_period:'指标、阶段、期间或单位不匹配',unconfirmed_extraction:'事实抽取尚未人工确认',missing_time:'可得时间缺失，不能用于该时点判断',future_evidence:'在观察截止时尚不可得',superseded_as_of:'被当时已可得的新版本取代',unknown_value:'数值未知，保留为 null'};
Object.assign(evReasons,{derived_not_independent:'AI／转载仅供追溯，不作独立事实支持',missing_primary_evidence:'无可用原始证据，转述不能补足',provenance_cycle:'父链循环，根源未知',provenance_missing_parent:'父节点缺失，根源未知',provenance_hash_mismatch:'来源角色或父链与记录哈希不符',provenance_invalid_parent:'父链未终止于原始来源',provenance_unregistered_root:'根源未在合成来源登记中核验',provenance_metadata_mismatch:'来源可见性或定位与父链不符'});
const evRoles={primary:'原始记录',repost:'转载／转述',ai:'AI 回答'};
const evFieldIds=['ev-thesis','ev-stage','ev-threshold','ev-start','ev-end'];
const evDate=value=>value.slice(0,10);
function evPopulate(){
  const c=evState.input.claim;$('ev-thesis').value=c.thesis;$('ev-stage').value=c.stage;
  $('ev-threshold').value=c.threshold;$('ev-start').value=evDate(c.periodStart);$('ev-end').value=evDate(c.periodEnd);
  $('ev-asof').value=evState.input.asOf.slice(0,16);$('ev-visibility').value=evState.input.visibility;
}
function evRuleText(){
  const threshold=$('ev-threshold').value||'（待填）',stage=evStages[$('ev-stage').value];
  return `${$('ev-start').value} 至 ${$('ev-end').value}，合成公司该阶段的完整季度总额：${stage} ≥ ${threshold} 万元。否证条件：完整总额 < ${threshold} 万元；只有下界、缺失值、时间不明或矛盾资料时保持未知。`;
}
function evInvalidate(){
  evState.sequence++;evState.report=null;evState.input.claim.confirmation='ai_candidate';
  $('ev-confirmation').textContent='候选命题 · 尚未人工确认（规则表单，无模型解析）';
  $('ev-rule').textContent=evRuleText();$('ev-current-status').textContent='未知';$('ev-baseline-status').textContent='—';
  $('ev-reason').textContent='表单已修改，请确认结构化命题和否证条件后再检查。';
  $('ev-change').textContent='旧结果已失效，修改尚未运行。';$('ev-export').disabled=true;
  $('ev-trace').replaceChildren();$('ev-conflicts').replaceChildren();$('ev-hashes').textContent='待新版本确认';
}
function evSources(report){
  const rows=report.selected.result.trace;
  const roots=[...new Set(rows.map(row=>row.originId).filter(Boolean))];$('ev-sources').replaceChildren();
  for(const origin of roots){
    const sourceIds=new Set(rows.filter(row=>row.originId===origin).map(row=>row.sourceId));
    const copies=evState.input.dataset.sources.filter(s=>sourceIds.has(s.id));
    const label=el('label','','ev-source');const box=document.createElement('input');box.type='checkbox';box.value=origin;box.checked=!evState.input.excludedOrigins.includes(origin);
    box.setAttribute('aria-label',`保留${copies[0].title}`);
    const words=el('span','');words.append(el('strong',copies[0].title),el('small',`${copies[0].visibility==='public'?'公开':'非公开 · 纯合成'} · ${copies.length} 个版本载体 · 1 个来源组`));
    label.append(box,words);$('ev-sources').append(label);
    box.addEventListener('change',()=>{evState.input.excludedOrigins=[...$('ev-sources').querySelectorAll('input:not(:checked)')].map(x=>x.value);evRun();});
  }
}
function evRender(report){
  const b=report.baseline,s=report.selected,r=s.result;
  evSources(report);
  $('ev-baseline-status').textContent=evStatus[b.result.status];$('ev-current-status').textContent=evStatus[r.status];
  $('ev-current-status').dataset.status=r.status;$('ev-reason').textContent=evReasons[r.reason];
  $('ev-confirmation').textContent=`人工确认的${s.claim.version===1?'合成样例':'命题'} · 命题 v${s.claim.version}`;
  const removed=report.change.removedOrigins.length;
  $('ev-change').textContent=removed?`${removed} 个来源组已删除：${evStatus[b.result.status]} → ${evStatus[r.status]}。${report.change.conclusionChanged?'结论随证据变化。':'结论未改变；这不证明被删来源没有价值。'}`:'未删除来源。取消勾选左侧来源，比较同一规则和截止时点的结果。';
  $('ev-scope').textContent=`${s.protocol.visibility==='public'?'仅公开样例':'全部合成样例'} · 观察截止 ${s.protocol.asOf} · 可用来源组 ${r.uniqueOrigins}（不计票）`;
  $('ev-conflicts').replaceChildren();
  for(const conflict of r.conflicts){$('ev-conflicts').append(el('p',`冲突：${conflict.evidenceIds.join(' ↔ ')}。相同期间和口径的数值不兼容。`,'ev-conflict'));}
  $('ev-trace').replaceChildren();
  for(const row of r.trace){
    const fact=s.dataset.observations.find(x=>x.id===row.id),source=s.dataset.sources.find(x=>x.id===row.sourceId);
    const article=el('article','','ev-evidence'),heading=el('div','','section-head');
    heading.append(el('strong',source.title),el('span',row.reason?evReasons[row.reason]:'纳入本次判断',row.included?'tag':'hint'));article.append(heading);
    article.append(el('p',fact.excerpt),el('p',`${evStages[fact.stage]} · ${fact.value===null?'未知':fact.value} 万元 · ${fact.coverage==='complete'?'完整期间总额':'已知下界'} · ${evDate(fact.periodStart)} 至 ${evDate(fact.periodEnd)}`,'muted'));
    const details=document.createElement('details');details.append(el('summary',`追溯 ${row.id} · 来源 v${row.sourceVersion}`));
    details.append(el('pre',`来源角色：${evRoles[row.provenance.kind]??'未知'}（人工确认不能改变）\n核验来源组：${row.originId??'未知'}\n输入标签（不作判据）：${row.declaredOriginId}\n合成父链：${row.provenance.verified?'完整且根源已登记':'未通过'}\n${row.provenance.chain.map(node=>`${evRoles[node.kind]} ${node.id} → ${node.parentId??'根节点'}`).join('\n')}\n发生：${row.occurredAt??'未知'}\n发布：${row.publishedAt??'未知'}\n首次可得：${row.availableAt??'未知'}\n定位：${source.url??'合成内置记录，无外链'}\n记录 hash：${row.recordHash}`));article.append(details);$('ev-trace').append(article);
  }
  $('ev-hashes').textContent=`引擎 ${s.engine}\n命题 v${s.claim.version} / 数据集 v${s.dataset.version}\n来源登记 ${s.registry.version}\n登记 hash ${s.hashes.registry}\n命题 ${s.hashes.claim}\n数据 ${s.hashes.dataset}\n协议 ${s.hashes.protocol}\n结果 ${s.hashes.result}`;
  $('ev-export').disabled=false;
}
async function evRun(){
  const seq=++evState.sequence;evState.report=null;$('ev-export').disabled=true;
  if(evState.input.claim.confirmation!=='human_confirmed'){evInvalidate();return;}
  try{
    const report=await compareEvidence(evState.input);if(seq!==evState.sequence)return;
    evState.report=report;evState.history.push({sequence:evState.history.length+1,status:'completed',report});
    evRender(report);$('ev-error').textContent='';
    $('ev-history').textContent=`当前会话已保留 ${evState.history.length} 次检查，包含未知、冲突与失败。刷新会清空；请导出以复核。`;
  }catch(error){
    if(seq!==evState.sequence)return;
    evState.history.push({sequence:evState.history.length+1,status:'failed',code:'invalid_input'});
    $('ev-current-status').textContent='未知';$('ev-baseline-status').textContent='—';$('ev-reason').textContent='输入校验失败，未接受结果。';
    $('ev-error').textContent=error.message;$('ev-trace').replaceChildren();$('ev-conflicts').replaceChildren();$('ev-hashes').textContent='未产生新结果';
  }
}
$('ev-form').addEventListener('submit',event=>{
  event.preventDefault();if(!$('ev-form').reportValidity())return;
  const c=evState.input.claim;evState.input.claim={...c,version:c.version+1,confirmation:'human_confirmed',
    thesis:$('ev-thesis').value.trim(),stage:$('ev-stage').value,threshold:Number($('ev-threshold').value),
    periodStart:$('ev-start').value+'T00:00:00.000Z',periodEnd:$('ev-end').value+'T23:59:59.999Z',falsification:evRuleText()};
  evRun();
});
for(const id of evFieldIds)$(id).addEventListener('input',evInvalidate);
$('ev-visibility').addEventListener('change',()=>{evState.input.visibility=$('ev-visibility').value;evRun();});
$('ev-asof').addEventListener('change',()=>{evState.input.asOf=$('ev-asof').value?$('ev-asof').value+':00.000Z':'';evRun();});
$('ev-reset').addEventListener('click',()=>{evState.input=structuredClone(EVIDENCE_EXAMPLE);evPopulate();$('ev-rule').textContent=evRuleText();evRun();});
$('ev-export').addEventListener('click',()=>{
  if(!evState.report)return;
  const blob=new Blob([JSON.stringify({report:evState.report,sessionChecks:evState.history},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=el('a','');a.href=url;a.download='jianchao-evidence-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
evPopulate();$('ev-rule').textContent=evRuleText();evRun();
