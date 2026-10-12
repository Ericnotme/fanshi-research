// One isolated headless browser, one page, sequential desktop/mobile checks.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence');fs.mkdirSync(out,{recursive:true});
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.HEADLESS_BROWSER?{executablePath:process.env.HEADLESS_BROWSER}:{}),args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true}),page=await context.newPage(),errors=[],network=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href);await page.locator('[data-tab="research"]').click();await page.locator('#coverage').filter({hasText:'8 / 8'}).waitFor();
 assert.equal(await page.locator('#candidates tr').count(),8);assert.equal(await page.locator('#chart polyline').count(),2);checks.push('Offline file renders 8 candidates, metrics and two chart series');
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
 const initial=await page.locator('#return').textContent();await page.locator('#fee').fill('15');await page.locator('#run').click();await page.locator('#timing').filter({hasText:'第 2 次运行'}).waitFor();assert.notEqual(await page.locator('#return').textContent(),initial);checks.push('Changed cost recalculates and records a distinct experiment');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(data.candidates.length,8);assert.equal(data.browserJournal.length,2);assert.equal(data.evidence.prospectiveStatus,'prospective-pending');assert.equal(data.evidence.modelCalled,false);assert.ok(data.test.ledger.length>0);checks.push('Download includes full experiment, all candidates, paper ledger, hashes and pending evidence');
 await page.locator('[data-tab="journal"]').click();assert.equal(await page.locator('.journal-item').count(),2);await page.reload();await page.locator('[data-tab="research"]').click();await page.locator('#coverage').filter({hasText:'8 / 8'}).waitFor();await page.locator('[data-tab="journal"]').click();assert.equal(await page.locator('.journal-item').count(),3);checks.push('Reload preserves prior local experiments and records new synthetic run');
 await page.locator('[data-tab="prize"]').click();await page.locator('#pool').fill('2');await page.locator('#prize-weights').fill('1,1,1');await page.locator('#prize-form button').click();assert.equal(await page.locator('#prize-total').textContent(),'2 / 2 积分');assert((await page.locator('#prize-results').textContent()).includes('0 积分'));checks.push('Prize allocator conserves pool with deterministic remainder ties');
 await page.locator('#prize-weights').fill('1,-1');await page.locator('#prize-form button').click();assert((await page.locator('#message').textContent()).includes('非负整数'));checks.push('Invalid prize input produces visible failure');
 await page.locator('[data-tab="boundaries"]').click();const boundary=await page.locator('#boundaries').textContent();assert(boundary.includes('均未真机验证'));assert(boundary.includes('executionAvailable'));checks.push('Unverified provider/device and absent execution boundary visible');
 for(const width of [390,320,1440]){await page.setViewportSize({width,height:900});for(const name of ['research','journal','prize','boundaries']){await page.locator(`[data-tab="${name}"]`).click();assert.equal(await page.locator('.panel:visible').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width}/${name}`);}}
 checks.push('All four panels fit 320, 390 and 1440px viewports');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-tab="research"]').click();await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 assert.deepEqual(network,[]);assert.deepEqual(errors,[]);checks.push('Zero external network requests and zero JavaScript errors');
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed:true,browser:await browser.version(),isolatedHeadless:true,browserProcesses:1,checks},null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,networkRequests:network.length,errors:errors.length}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
