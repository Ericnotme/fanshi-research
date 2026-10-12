import {readFile,writeFile,mkdir} from 'node:fs/promises';
const core=await readFile('src/core.mjs','utf8'),phone=await readFile('src/phone.mjs','utf8'),app=await readFile('web/app.mjs','utf8');
const evidence=await readFile('src/evidence.mjs','utf8'),evidenceApp=await readFile('web/evidence-app.mjs','utf8');
const provenance=await readFile('src/synthetic-provenance.mjs','utf8');
const fixture=JSON.parse(await readFile('examples/evidence.json','utf8'));
const publicCase=JSON.parse(await readFile('examples/public-phone-pricing.json','utf8'));
const publicApp=await readFile('web/public-research-app.mjs','utf8');
const bundle=[core,phone,provenance,evidence,`const EVIDENCE_EXAMPLE=${JSON.stringify(fixture)};`,
  `const PUBLIC_RESEARCH_CASE=${JSON.stringify(publicCase)};`,app,evidenceApp,publicApp].map(x=>x.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
if(/<\/script/i.test(bundle))throw Error('Unsafe inline script terminator');
const brand=JSON.parse(await readFile('branding.json','utf8'));
if(Object.keys(brand).sort().join(',')!=='localizedName,projectName,releaseState,wordmark')throw Error('Invalid branding fields');
for(const key of ['projectName','localizedName','wordmark'])if(typeof brand[key]!=='string'||brand[key].length<1||brand[key].length>60)throw Error('Invalid brand label');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let template=await readFile('web/index.html','utf8');
// Only presentation labels change. Historical project names, source archive
// filenames, repo identity and Site slug are separate release decisions.
template=template.replaceAll('Strategy Lab',escape(brand.projectName)).replaceAll('策略试验台',escape(brand.localizedName)).replaceAll('STRATEGY LAB',escape(brand.wordmark));
const html=template.replace('/*STYLE*/',await readFile('web/style.css','utf8')).replace('/*APP*/',bundle);
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',html);console.log(`Built self-contained offline demo: ${Buffer.byteLength(html)} bytes`);
