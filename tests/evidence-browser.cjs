// One isolated browser, offline synthetic input. No existing user profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
let browser;
(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.HEADLESS_BROWSER?{executablePath:process.env.HEADLESS_BROWSER}:{}),
    args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions']});
  const context=await browser.newContext({viewport:{width:1440,height:1100},offline:true}),page=await context.newPage(),errors=[],network=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
  const status=async text=>page.waitForFunction(text=>document.getElementById('ev-current-status').textContent===text,text);
  const done=async()=>page.waitForFunction(()=>!document.getElementById('ev-export').disabled);
  await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href);await done();await status('成立');
  assert.equal(await page.locator('#evidence:visible').count(),1);assert.equal(await page.locator('#ev-trace article').count(),6);
  assert((await page.locator('h1').textContent()).includes('删掉这条消息'));checks.push('Public synthetic claim loads without login or keys with six traceable records');
  await page.screenshot({path:path.join(out,'evidence-desktop.png'),fullPage:true});
  await page.locator('#ev-sources input[value="issuer-report"]').uncheck();await status('未知');await done();
  assert.equal(await page.locator('#ev-baseline-status').textContent(),'成立');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#ev-export').click()]);
  const report=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(report.report.selected.result.status,'unknown');assert.equal(report.report.baseline.result.uniqueOrigins,1);
  assert.equal(report.report.change.changedEvidence.length,2);assert.equal(report.report.selected.dataset.kind,'synthetic');
  assert.equal(report.report.selected.schemaVersion,2);assert.equal(report.report.selected.registry.version,'synthetic-roots/1');
  const repost=report.report.selected.result.trace.find(row=>row.id==='revenue-repost');
  assert.equal(repost.provenance.kind,'repost');assert.equal(repost.provenance.chain.length,2);
  checks.push('Removing the root removes its repost, changes supported to unknown, and exports complete reproducible evidence');
  await page.locator('#ev-sources input[value="issuer-report"]').check();await status('成立');
  await page.locator('#ev-visibility').selectOption('all');await status('未知');await done();
  assert((await page.locator('#ev-conflicts').textContent()).includes('revenue-conflict'));
  await page.locator('#ev-sources input[value="synthetic-note"]').uncheck();await status('成立');await done();
  checks.push('All-source mode exposes the contradictory synthetic note; removing it restores the rule result');
  await page.locator('#ev-asof').fill('2026-07-01T12:00');await page.locator('#ev-asof').dispatchEvent('change');await status('未知');await done();
  assert((await page.locator('#ev-trace').textContent()).includes('在观察截止时尚不可得'));
  checks.push('Earlier as-of time excludes later evidence visibly');
  await page.locator('#ev-reset').click();await status('成立');await done();
  await page.locator('#ev-thesis').fill('合成新论点 <img src=x onerror=alert(1)>');await status('未知');
  assert.equal(await page.locator('#ev-export').isDisabled(),true);assert.equal(await page.locator('#ev-trace article').count(),0);
  await page.locator('#ev-confirm').click();await status('成立');await done();
  assert((await page.locator('#ev-confirmation').textContent()).includes('v2'));assert.equal(await page.locator('#evidence img').count(),0);
  await page.locator('#ev-threshold').fill('200');await page.locator('#ev-confirm').click();await status('不成立');await done();
  checks.push('Edits invalidate old results, require manual confirmation, create a new version and treat text as text');
  await page.locator('#ev-threshold').fill('');await page.locator('#ev-confirm').click();await status('未知');
  assert.equal(await page.locator('#ev-export').isDisabled(),true);await page.locator('#ev-reset').click();await status('成立');await done();
  checks.push('Empty numeric input cannot silently become zero or export a stale accepted report');
  assert((await page.locator('#ev-trace').textContent()).includes('AI／转载仅供追溯'));
  assert((await page.locator('#ev-hashes').textContent()).includes('登记 hash'));
  checks.push('Source roles, immutable parent hash references and registry version are shown and exported');
  await page.locator('[data-tab="public-research"]').click();
  assert.equal(await page.locator('.panel:visible').count(),1);
  assert((await page.locator('[data-claim="price-proves-profit"]').textContent()).includes('不足以证明'));
  assert((await page.locator('[data-claim="repricing-alpha"]').textContent()).includes('未知'));
  assert.equal(await page.locator('#public-facts [data-fact]').count(),5);
  assert((await page.locator('[data-fact="xiaomi-margin"]').textContent()).includes('12.0% → 9.3%'));
  assert((await page.locator('[data-fact="xiaomi-margin"]').textContent()).includes('Management Discussion and Analysis → Gross Profit and Margin → Smartphone × AIoT'));
  assert((await page.locator('[data-fact="xiaomi-asp"]').textContent()).includes('Management Discussion and Analysis → Revenue / Smartphones'));
  assert.equal((await page.locator('#public-facts').textContent()).includes('印刷页'),false);
  assert.equal(await page.locator('[data-fact="xiaomi-margin"] a').getAttribute('href'),'https://ir.mi.com/static-files/b903a881-8143-44a3-b759-703653bbb043#page=24');
  const [caseDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#public-export').click()]);
  const caseExport=JSON.parse(fs.readFileSync(await caseDownload.path(),'utf8'));
  assert.equal(caseExport.case.kind,'public_source_research_case');assert.equal(caseExport.case.boundary.automatedEvidenceEngineUsed,false);
  assert.equal(caseExport.case.boundary.historicalSignalEligible,false);assert.equal(caseExport.case.boundary.alphaValidated,false);
  assert.ok(caseExport.case.sources.every(source=>source.firstPublicAt===null));assert.match(caseExport.caseHash,/^[a-f0-9]{64}$/);
  checks.push('Separate public case shows a bounded counterexample and unknown alpha, with primary links and distinct JSON export');
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    for(const tab of ['evidence','public-research']){
      await page.locator(`[data-tab="${tab}"]`).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}/${tab}`);
    }
  }
  await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:path.join(out,'public-research-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'public-research-mobile.png'),fullPage:true});
  await page.locator('[data-tab="evidence"]').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'evidence-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);checks.push('320/390/1440px layouts fit; zero external network requests and JavaScript errors');
  fs.writeFileSync(path.join(out,'evidence-browser-results.json'),JSON.stringify({passed:true,browser:await browser.version(),checks,networkRequests:network.length,errors:errors.length},null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,networkRequests:network.length,errors:errors.length}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
