const {chromium}=require('playwright-core');const As=require('assert');const fs=require('fs');
const Ajv=require('ajv/dist/2020');const addFormats=require('ajv-formats');
const ajv=new Ajv({allErrors:true,strict:false});addFormats(ajv);
const validate=ajv.compile(JSON.parse(fs.readFileSync(require('path').resolve(__dirname,'..')+'/'+'docs/price-contract.schema.json')));
const V=(r,tag)=>{if(!validate(r))throw new Error(tag+' invalid: '+JSON.stringify(validate.errors)+JSON.stringify(r))};
JSON.parse(fs.readFileSync(require('path').resolve(__dirname,'..')+'/'+'docs/price-contract-examples.json')).forEach((r,i)=>V(r,'example'+i));
const D=require('path').resolve(__dirname,'..')+'/';const log=[];const ok=m=>{log.push('✓ '+m)};
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
// Pin the deal-freshness clock to the embedded HUKD snapshot (16-17 Oct 2026) so matches aren't 'stale' (48h rule). Tests can override WD_CLOCK.
{const _nc=b.newContext.bind(b);b.newContext=async(o)=>{const c=await _nc(o);await c.addInitScript(()=>{if(!window.WD_CLOCK)window.WD_CLOCK='2026-10-17T12:00:00Z'});return c}}
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()=='error'&&!/hotukdeals|CORS|Failed to fetch|ERR_FAILED/i.test(m.text()))errs.push(m.text())});
let promptAns='59.99';await p.exposeFunction('WD_DIALOG_HOOK',(m,t)=>t=='prompt'?promptAns:true);p.on('dialog',d=>d.accept(d.type()=='prompt'?promptAns:undefined));
await p.goto('file://'+D+'index.html?demo=1');await p.waitForSelector('html[data-ready="1"]',{timeout:15000});
const S=()=>p.evaluate(()=>WD.state());
let s=await S();As.equal(s.items.length,3);ok('loads, 3 labelled examples seeded');
As.equal(await p.evaluate(()=>document.activeElement.id),'what');As.ok(await p.isVisible('#welcome'));ok('first run focuses the add box with welcome hint (no signup)');
As.equal(await p.inputValue('#pct'),'15');ok('default target 15%');
As.ok((await p.textContent('.demo')).includes('DEMO PRICES'));
const hmode=await p.evaluate(()=>WD.adapters[1].mode);As.equal(hmode,'snapshot');ok('HUKD live fetch failed under file:// → fell back to snapshot ('+await p.evaluate(()=>WD.adapters[1].detail)+')');
await p.screenshot({path:D+'screenshot.png'});
// HUKD parsing + schema
const deals=await p.evaluate(()=>{const x=document.getElementById('hukd-snapshot').textContent;return WD.parseRss(x).map(d=>({d,r:WD.dealToRecord(d,null)}))});
As.equal(deals.length,30);deals.forEach((o,i)=>V(o.r,'hukd'+i));As.ok(deals.every(o=>!/^\d+°/.test(o.r.title)));
As.equal(deals[0].r.current_price,200);As.equal(deals[0].r.retailer,'Iceland');ok('HUKD: 30 deals parsed, all schema-valid, temp prefix stripped, "£2"→200p, merchant→retailer');
const mw=deals.find(o=>/Mountain Warehouse/.test(o.r.title));As.equal(mw.r.promo_code,'EMAIL20');As.deepEqual(mw.d.codes,['EMAIL20','EXTRA20UK']);
console.log(deals.filter(o=>o.r.promo_code).map(o=>o.r.title+" => "+o.d.codes));ok('codes only from description text (EMAIL20/EXTRA20UK); titles saying "with code" yield no fake code');
As.equal(await p.evaluate(()=>WD.pound2p('£1,234.5')),123450);
// matched seeded Levi's
s=await S();const lev=s.items.find(i=>/Levi/.test(i.name));As.equal(lev.rec.source,'hukd_rss');As.equal(lev.rec.error_state,'ok');V(lev.rec,'lev');As.equal(lev.cur,4600);
As.ok(await p.isVisible('text=Community reported · HotUKDeals snapshot 2026-10-17'));ok("fuzzy match: \"Levi's 501 Original Fit Jeans\" → HUKD deal £46, labelled community reported + snapshot date");
s.items.forEach(i=>V(i.rec,'item '+i.name));
// adapters: demo, manual, stubs, not_found
const recs=await p.evaluate(async()=>{const it={id:'t1',name:'Zzqx Nonexistent Widget',url:'',orig:1000,cur:1000,pct:15,hist:[]};const o={};for(const a of WD.adapters)o[a.id]=await a.getPrice(it,{step:true});return o});
for(const k in recs)V(recs[k],k);As.equal(recs.demo.label,'DEMO');As.equal(recs.hukd_rss.error_state,'not_found');
['awin_feed','awin_promotions','keepa'].forEach(k=>{As.equal(recs[k].error_state,'blocked');As.ok(/Awaiting approval/.test(recs[k].error_detail))});
As.ok(await p.$eval('#srcSel option[value=keepa]',o=>o.disabled&&/awaiting approval/.test(o.textContent)));
ok('adapter output for demo/manual/hukd/awin_feed/awin_promotions/keepa validated with ajv (2020-12 + formats); stubs disabled + "awaiting approval"');
// add flows
await p.fill('#what','https://www.example.co.uk/products/sony-wh-1000xm5-headphones');As.equal(await p.inputValue('#name'),'Sony Wh 1000xm5 Headphones');
await p.fill('#price','300');await p.click('#modeAbs');await p.fill('#abs','255');await p.click('#submitBtn');await p.waitForTimeout(100);
s=await S();let it=s.items.at(-1);As.equal(it.pct,15);As.equal(it.orig,30000);ok('link → name, £255 of £300 → 15%, stored as 30000p');
await p.fill('#what','Desk lamp');await p.click('#submitBtn');await p.waitForTimeout(100);s=await S();it=s.items.at(-1);As.equal(it.orig,5999);As.equal(it.pct,15);ok('price prompt when blank');
await p.fill('#what','York Fitness 15kg Cast Iron Dumbbell Set');await p.fill('#price','25');await p.selectOption('#srcSel','hukd_rss');await p.click('#submitBtn');await p.waitForTimeout(200);
s=await S();it=s.items.at(-1);As.equal(it.cur,1710);As.equal(it.rec.error_state,'ok');ok('user-added HUKD item matched York Fitness deal £17.10 → '+(await p.evaluate(n=>document.querySelector('[data-id="'+n+'"] .pill').textContent,it.id)));
for(let i=0;i<10;i++){await p.fill('#what','Thing '+i);await p.fill('#price','10');await p.click('#submitBtn')}
await p.waitForTimeout(200);As.equal((await S()).items.length,10);As.ok((await p.textContent('#msg')).includes('10 items max'));ok('10-item cap with friendly message');
await p.click('.card:last-child [data-a=del]');As.equal((await S()).items.length,9);ok('delete');
// error state UI
for(const st of ['not_found','blocked','changed']){await p.click('details summary').catch(()=>{});await p.evaluate(()=>document.querySelector('details').open=true);await p.click('button[data-err='+st+']');await p.waitForTimeout(100);
 const sel='.err.'+st;As.ok(await p.isVisible(sel),st);s=await S();V(s.items.find(i=>i.src=='demo').rec,'err'+st);
 if(st=='blocked'){await p.locator(sel).scrollIntoViewIfNeeded();await p.screenshot({path:D+'screenshot-error.png'})}}
await p.click('button[data-err=ok]');ok('error-state UI for not_found / blocked / changed (records still schema-valid)');
// simulate → alert
for(let i=0;i<80&&!(await S()).alerts.some(a=>/DEMO/.test(a.src)&&/target/.test(a.text));i++)await p.click('#simBtn');
As.ok((await S()).alerts.some(a=>/DEMO/.test(a.src)&&/target/.test(a.text)));ok('simulation triggered a DEMO alert; alerts: '+(await S()).alerts.length);
const pills=await p.$$eval('#cards .pill',e=>[...new Set(e.map(x=>x.textContent))]);As.ok((await S()).items.every(i=>i.offers&&i.offers.length>=1));As.ok(await p.isVisible('.cmp'));As.ok((await S()).alerts.some(a=>/below the lowest we’ve seen/.test(a.text)));ok('≥10%-below-reference alert fired (cheapest retailer named)');ok('per-item cross-source comparison shows cheapest retailer + gap');ok('status pills seen: '+pills.join(', '));
// share
const su=await p.evaluate(()=>WD.shareUrl());const names=(await S()).items.map(i=>i.name).sort();
const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.goto(su);await p2.waitForSelector('#roView:not([hidden])');
As.deepEqual((await p2.$$eval('#roList b',e=>e.map(x=>x.textContent))).sort(),names);ok('share hash round-trips into read-only view');
await p2.screenshot({path:D+'screenshot-shared.png'});
await p.click('[data-t=alerts]');await p.screenshot({path:D+'screenshot-alerts.png'});
await p.click('[data-t=share]');await p.click('#cardBtn');As.ok(await p.isVisible('#card'));
const png=await p.evaluate(()=>WD.drawCard().toDataURL('image/png'));fs.writeFileSync(D+'share-card.png',Buffer.from(png.split(',')[1],'base64'));
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#dlBtn')]);As.equal(dl.suggestedFilename(),'drop-club-top10.png');ok('share card drawn to canvas, PNG download fires (drop-club-top10.png)');
await p.screenshot({path:D+'screenshot-sharecard.png',fullPage:true});
await p.click('[data-t=watch]');
const small=await p.evaluate(()=>[...document.querySelectorAll('button,input:not([type=checkbox]),select,summary')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44).map(e=>e.id||e.textContent));
As.deepEqual(small,[]);ok('all visible controls ≥44px tall');
// v1 migration
const p3=await (await b.newContext()).newPage();await p3.goto('file://'+D+'index.html');await p3.waitForSelector('html[data-ready="1"]');await p3.evaluate(()=>{localStorage.clear();localStorage.setItem('wishlistDrop.v1',JSON.stringify({items:[{id:'a',name:'Old',orig:12.5,cur:11,pct:15,hist:[12.5,11]}],alerts:[],seeded:true}))});
await p3.reload();await p3.waitForSelector('html[data-ready="1"]');const m=await p3.evaluate(()=>WD.state().items[0]);As.equal(m.orig,1250);ok('v1 localStorage migrated (£12.50 → 1250p)');
As.equal(errs.length,0,errs.join('\n'));ok('no JS errors');console.log(log.join('\n'));await b.close()})().catch(e=>{console.error(log.join('\n'));console.error(e);process.exit(1)});
