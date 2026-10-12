// An explicitly separate editorial case. Never feed it to the synthetic evidence engine.
const publicCase=structuredClone(PUBLIC_RESEARCH_CASE);
function publicLink(source,label=source.title,fragment=''){
  const link=el('a',label+' ↗');link.href=source.url+fragment;link.target='_blank';link.rel='noopener noreferrer';return link;
}
$('public-case-intro').textContent=publicCase.scope;
for(const claim of publicCase.claims){
  const card=el('article','','card wide');card.dataset.claim=claim.id;
  card.append(el('p','研究命题','step-label'),el('h3',claim.question),el('span',claim.statusLabel,'tag'),el('p',claim.scope,'muted'),el('p',claim.reason),el('p','否证／下一步：'+claim.falsification,'hint'));
  const parents=el('p','证据父节点：'+claim.parentEvidenceIds.join(' · '),'hint');card.append(parents);$('public-claims').append(card);
}
for(const fact of publicCase.facts){
  const card=el('article','','ev-evidence'),source=publicCase.sources.find(s=>s.id===fact.sourceId);
  card.dataset.fact=fact.id;card.append(el('h3',fact.label),el('p',fact.display??fact.summary),el('p','期间：'+fact.period,'muted'),el('p',fact.qualification,'hint'));
  const locator=fact.locator;card.append(publicLink(source,`${source.title} · PDF第${locator.pdfPage}页（零索引${locator.pdfIndex}${locator.printedPage?'，印刷页'+locator.printedPage:''}）`,`#page=${locator.pdfPage}`));
  card.append(el('p',`章节定位：${locator.section}`,'hint'));
  card.append(el('p',`记录 ${fact.id} → 原始来源 ${fact.sourceId}`,'hint'));$('public-facts').append(card);
}
for(const source of publicCase.sources){
  const card=el('article','','ev-evidence');card.append(publicLink(source),el('p',source.note,'muted'));
  card.append(el('p',`公开日期：${source.publicationDate??'未核实'}${source.documentDated?'；文件落款：'+source.documentDated:''}；首次公开精确时刻：${source.firstPublicAt??'未知'}`,'hint'),el('p',source.firstPublicTimeBasis,'hint'));
  $('public-sources').append(card);
}
$('public-time-boundary').textContent=publicCase.timeBoundary;
$('public-reviewed').textContent=`本次核查 ${publicCase.reviewedAt} · 自写摘要 · 未运行收益检验`;
$('public-case-boundary').textContent=publicCase.boundary.note;
$('public-export').addEventListener('click',async()=>{
  const report={case:publicCase,caseHash:await digest(publicCase),hashMeaning:'Fingerprint of this local case JSON, not a hash/signature of the official documents.'};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a','');
  a.href=url;a.download='jianchao-public-phone-pricing.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
