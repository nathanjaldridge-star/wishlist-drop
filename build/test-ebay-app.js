// App-side tests for the eBay adapter, URL parsing, live preview and pending queue (issue #11, #1 phase 1). Run: node build/test-ebay-app.js
// eBay data is mocked: the page reads a routed ebay.json (window.WD_EBAY), exactly the shape scripts/fetch-ebay.mjs publishes.
const {chromium}=require('playwright-core');const As=require('assert');const fs=require('fs');const path=require('path');
const Ajv=require('ajv/dist/2020');const addFormats=require('ajv-formats');const ajv=new Ajv({allErrors:true,strict:false});addFormats(ajv);
const D=path.resolve(__dirname,'..')+'/';const validate=ajv.compile(JSON.parse(fs.readFileSync(D+'docs/price-contract.schema.json')));
const V=(r,t)=>{if(!validate(r))throw new Error(t+' invalid: '+JSON.stringify(validate.errors)+JSON.stringify(r))};
const log=[];const ok=m=>log.push('✓ '+m);
const CLOCK='2026-10-24T13:00:00Z',AT='2026-10-24T12:37:00Z';
const rec=(o)=>Object.assign({product_id:'ebay:112',canonical_url:'https://www.ebay.co.uk/itm/112',retailer:'eBay',title:'Sony WH-1000XM5 Wireless Silver',current_price:24999,currency:'GBP',fetched_at:AT,in_stock:true,was_price:null,is_promo:false,promo_code:null,delivery_cost:349,price_history:[{date:AT,price:24999}],source:'ebay_browse',confidence:0.9,error_state:'ok',error_detail:null,watch_id:'sony-wh-1000xm5',market_stats:{lowest:24999,median:27200,mean:27075,count:4,trimmed:1,basis:'new, Buy It Now, GBP, item price excl. delivery'}},o);
const EBAY={version:1,generated_at:AT,source:'ebay_browse',status:'ok',watchlist:[{id:'sony-wh-1000xm5',title:'Sony WH-1000XM5 Wireless Headphones'},{id:'switch-oled',title:'Nintendo Switch OLED console'},{id:'dyson-v8',title:'Dyson V8 cordless vacuum cleaner'}],
 items:[rec({}),rec({product_id:'ebay:334455667788',canonical_url:'https://www.ebay.co.uk/itm/334455667788',title:'Nintendo Switch OLED Model White NEW',current_price:26999,delivery_cost:0,price_history:[{date:AT,price:26999}],watch_id:'switch-oled',market_stats:{lowest:26999,median:28999,mean:29100,count:9,trimmed:0,basis:'x'}}),
  rec({product_id:'ebay:watch:dyson-v8',canonical_url:'https://www.ebay.co.uk/sch/i.html?_nkw=Dyson',title:'Dyson V8 cordless vacuum cleaner',current_price:null,delivery_cost:null,in_stock:null,price_history:[],confidence:0,error_state:'not_found',error_detail:'No eBay listings found for this item.',watch_id:'dyson-v8',market_stats:undefined})]};
EBAY.items.forEach((r,i)=>{if(r.market_stats===undefined)delete r.market_stats;V(r,'fixture'+i)});
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
const open=async({ebay,clock=CLOCK,q='',ls}={})=>{const ctx=await b.newContext({viewport:{width:390,height:844}});
 if(ebay!==undefined)await ctx.route('**/ebay.json',r=>ebay===500?r.fulfill({status:404,body:'nf'}):r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(ebay)}));
 await ctx.addInitScript(([e,c])=>{window.WD_SKIP_LIVE=true;window.WD_CLOCK=c;if(e)window.WD_EBAY='https://qa.invalid/ebay.json'},[ebay!==undefined,clock]);
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));await p.exposeFunction('WD_DIALOG_HOOK',(m,t)=>t=='prompt'?'59.99':true);
 await p.goto('file://'+D+'index.html'+q);await p.waitForSelector('html[data-ready="1"]',{timeout:15000});return p};
// 1. URL parsing (no fetch)
let p=await open();
const P=u=>p.evaluate(u=>WD.parseProductUrl(u),u);
let x=await P('https://www.amazon.co.uk/Sony-WH-1000XM5-Cancelling-Headphones-Black/dp/B09XS7JWHH/ref=sr_1_3?keywords=xm5');As.equal(x.retailer,'Amazon');As.equal(x.asin,'B09XS7JWHH');As.equal(x.title,'Sony WH 1000XM5 Cancelling Headphones Black');
x=await P('https://www.amazon.co.uk/dp/B0BX2L8PBT');As.equal(x.asin,'B0BX2L8PBT');As.equal(x.title,null);
x=await P('https://www.ebay.co.uk/itm/334455667788?hash=item4e');As.equal(x.retailer,'eBay');As.equal(x.ebayId,'334455667788');
x=await P('https://www.ebay.co.uk/itm/Nintendo-Switch-OLED-White/334455667788');As.equal(x.ebayId,'334455667788');As.equal(x.title,'Nintendo Switch OLED White');
x=await P('https://www.argos.co.uk/product/8349024?clickSR=slp');As.equal(x.retailer,'Argos');As.equal(x.retailerId,'8349024');As.equal(x.title,null);
x=await P('https://www.currys.co.uk/products/sony-wh-1000xm5-wireless-bluetooth-noise-cancelling-headphones-black-10241024.html');As.equal(x.retailer,'Currys');As.equal(x.retailerId,'10241024');As.equal(x.title,'Sony Wh 1000xm5 Wireless Bluetooth Noise Cancelling Headphones Black');
x=await P('https://www.johnlewis.com/sony-wh-1000xm5-noise-cancelling-headphones/black/p6045633');As.equal(x.retailer,'John Lewis');As.equal(x.retailerId,'6045633');As.equal(x.title,'Sony Wh 1000xm5 Noise Cancelling Headphones');
x=await P('https://ao.com/product/af400uk-ninja-foodi-max-dual-zone-air-fryer-black-79423-46.aspx');As.equal(x.retailer,'AO');As.equal(x.retailerId,'79423-46');As.equal(x.title,'Af400uk Ninja Foodi Max Dual Zone Air Fryer Black');
As.equal(await P('https://example.com/thing'),null);
await p.fill('#what','https://www.argos.co.uk/product/8349024');As.match(await p.textContent('#whatHint'),/Argos link · product 8349024\. This link doesn’t include the product name/);As.match(await p.textContent('#whatHint'),/never open the page/);
await p.fill('#what','https://www.amazon.co.uk/Sony-WH-1000XM5-Cancelling-Headphones-Black/dp/B09XS7JWHH');As.equal(await p.inputValue('#name'),'Sony WH 1000XM5 Cancelling Headphones Black');As.match(await p.textContent('#whatHint'),/Amazon link · ASIN B09XS7JWHH/);
ok('URL parsing (link text only, no fetch): Amazon ASIN + slug title, eBay item ID (+slug), Argos product no. (asks for the name), Currys / John Lewis / AO slug titles + IDs, unknown host → null');
// 2. awaiting approval (no ebay.json yet)
let st=await p.evaluate(async()=>{const r=await WD.ebay.getPrice({id:'z',name:'Sony WH-1000XM5',url:''});const o=document.querySelector('#srcSel option[value=ebay_browse]');return{r,en:WD.ebay.enabled,dis:o.disabled,txt:o.textContent}});
As.equal(st.en,false);As.equal(st.dis,true);As.match(st.txt,/awaiting approval/);As.equal(st.r.error_state,'blocked');As.match(st.r.error_detail,/Awaiting approval/);V(st.r,'awaiting');
await p.click('[data-t=sources]').catch(()=>{});
ok('no eBay data → adapter disabled, option "(awaiting approval)", getPrice → blocked "Awaiting approval" (schema-valid)');
await p.context().close();
p=await open({ebay:500});As.equal(await p.evaluate(()=>WD.ebay.mode),'awaiting');As.equal(await p.evaluate(()=>WD.ebay.enabled),false);await p.context().close();
p=await open({ebay:{...EBAY,items:[EBAY.items[2]]}});As.equal(await p.evaluate(()=>WD.ebay.enabled),false);await p.context().close();
ok('ebay.json missing (404) or with no ok records → stays "awaiting approval"');
// 3. live: preview, typical price, suggested target, add
p=await open({ebay:EBAY});
As.equal(await p.evaluate(()=>WD.ebay.mode),'live');As.equal(await p.$eval('#srcSel option[value=ebay_browse]',o=>o.disabled),false);
await p.fill('#what','Sony WH-1000XM5 headphones');await p.evaluate(()=>WD.preview());
let pv=await p.textContent('#livePrev');
As.match(pv,/Live price from eBay – checked 24 Oct, 1[23]:37/);As.match(pv,/lowest £249\.99 \(new, Buy It Now, \+ £3\.49 delivery\)/);
As.match(pv,/Typical price on eBay: £272\.00 \(median of 4 listings\)\. That’s eBay’s typical asking price, not an RRP\./);As.match(pv,/Suggested target: £244\.80, 10% below eBay’s typical price/);
As.equal(await p.inputValue('#price'),'272.00');As.equal(await p.inputValue('#pct'),'10');As.equal(await p.inputValue('#srcSel'),'ebay_browse');
As.equal(await p.$eval('#livePrev a',a=>a.href),'https://www.ebay.co.uk/itm/112');
ok('live: typing a watched item shows "Live price from eBay – checked <time>", lowest + delivery, "Typical price on eBay: £272.00 (median of 4 listings)" (not RRP), suggests £244.80 = 10% below typical and pre-fills it');
await p.click('#submitBtn');await p.waitForTimeout(300);
let it=await p.evaluate(()=>WD.state().items.at(-1));
As.equal(it.src,'ebay_browse');As.equal(it.orig,27200);As.equal(it.pct,10);As.equal(it.cur,24999);As.equal(it.refSrc,'ebay_typical');As.equal(it.rec.source,'ebay_browse');V(it.rec,'added');As.equal(it.pt.t,AT);
As.ok(!(await p.evaluate(()=>(WD.state().pending||[]).length)),'watched item queued');
let card=await p.textContent('.card:last-child');
As.match(card,/Price: eBay, live price · eBay/);As.match(card,/checked 24 Oct, 1[23]:37/);As.match(card,/Typical price on eBay: £272\.00 \(median of 4 listings, checked 24 Oct/);As.match(card,/not an RRP/);
As.match(card,/Target: 10% below eBay’s typical price when you added it \(£272\.00\)/);As.match(card,/Live price · eBay/);
ok('added item uses eBay: price £249.99 labelled "eBay, live price" with eBay\'s own check time, typical price line, target described as 10% below eBay\'s typical price');
// 4. pasted eBay URL matches by item ID
await p.fill('#what','https://www.ebay.co.uk/itm/Switch-White/334455667788');await p.evaluate(()=>WD.preview());pv=await p.textContent('#livePrev');
As.match(pv,/Nintendo Switch OLED console: lowest £269\.99 \(new, Buy It Now, free delivery\)/);As.match(pv,/median of 9 listings/);
ok('pasted eBay link → matched by item ID to the watch list');
// 5. unmatched → watching + queued
await p.fill('#what','Zzqx Garden Gnome Deluxe');await p.evaluate(()=>WD.preview());pv=await p.textContent('#livePrev');
As.match(pv,/Watching – no live price yet/);As.match(pv,/isn’t on our eBay watch list yet/);As.equal(await p.inputValue('#price'),'');
await p.fill('#price','30');await p.click('#submitBtn');await p.waitForTimeout(200);
As.match(await p.textContent('#msg'),/We’ll start checking this item on eBay when synced lists launch; until then we check HotUKDeals\./);
let pend=await p.evaluate(()=>WD.state().pending);As.equal(pend.length,1);As.equal(pend[0].name,'Zzqx Garden Gnome Deluxe');
await p.fill('#what','https://www.amazon.co.uk/Garden-Hose-Reel/dp/B0TESTASIN');await p.fill('#price','20');await p.click('#submitBtn');await p.waitForTimeout(200);
pend=await p.evaluate(()=>WD.state().pending);As.equal(pend.length,2);As.equal(pend[1].asin,'B0TESTASIN');As.equal(pend[1].retailer,'Amazon');
await p.reload();await p.waitForSelector('html[data-ready="1"]');As.equal((await p.evaluate(()=>WD.state().pending)).length,2);
ok('unmatched item → "Watching – no live price yet", no price pre-filled, queued locally (with ASIN/retailer) for the checker, persists across reload; message says checks start when synced lists launch');
// 6. user-typed price wins over the suggestion
await p.fill('#price','300');await p.fill('#what','Sony WH-1000XM5');await p.evaluate(()=>WD.preview());As.equal(await p.inputValue('#price'),'300');
ok('a price the user typed is never overwritten by the suggestion');
// 7. popular on eBay
await p.click('[data-t=share]');As.ok(await p.isVisible('#popWrap'));const pop=await p.textContent('#popList');As.match(pop,/Sony WH-1000XM5 Wireless Headphones/);As.match(pop,/Nintendo Switch OLED console/);As.ok(!/Dyson/.test(pop));As.match(pop,/Lowest on eBay · checked 24 Oct/);As.match(pop,/median of 4 listings/);
await p.click('#popList button[data-pop=switch-oled]');await p.waitForTimeout(400);As.equal(await p.inputValue('#what'),'Nintendo Switch OLED console');As.equal(await p.inputValue('#price'),'289.99');
ok('Top 10 tab lists "Popular on eBay right now" from ok records only; "Watch this" fills the add form with the typical price');
// 8. honest labels: every shown price has a source label
const unl=await p.$$eval('.card',cs=>cs.filter(c=>{const b=c.querySelector('.stats b');return b&&/£/.test(b.textContent)&&!/Price: /.test(c.querySelector('.srcline').textContent)}).length);As.equal(unl,0);
const sources=await p.evaluate(()=>{const ebay=[...document.querySelectorAll('#srcList .src')].find(e=>/eBay/.test(e.textContent));return ebay&&ebay.textContent});As.match(sources,/Live/);As.match(sources,/not an RRP/);
As.equal(p.errs.length,0,p.errs.join('|'));await p.context().close();
ok('no unlabelled prices on cards; Sources lists eBay as Live with the not-an-RRP note; no JS errors');
// 9. stale eBay data (>6h, eBay's licence limit) is not shown
p=await open({ebay:EBAY,clock:'2026-10-24T18:38:00Z'});await p.fill('#what','Sony WH-1000XM5 headphones');await p.evaluate(()=>WD.preview());pv=await p.textContent('#livePrev');
As.ok(!/Live price from eBay/.test(pv),pv);
st=await p.evaluate(()=>WD.ebay.getPrice({id:'s',name:'Sony WH-1000XM5 headphones',url:''}));As.equal(st.error_state,'not_found');As.match(st.error_detail,/older than 6h/);V(st,'stale');
await p.context().close();ok('eBay records more than 6h old are not shown (eBay licence; not_found "older than 6h")');
// 10. shared list keeps the eBay label
p=await open({ebay:EBAY});await p.fill('#what','Sony WH-1000XM5 headphones');await p.evaluate(()=>WD.preview());await p.click('#submitBtn');await p.waitForTimeout(300);
const su=await p.evaluate(()=>WD.shareUrl());await p.goto(su);await p.waitForSelector('#roView:not([hidden])');As.match(await p.textContent('#roList'),/eBay, live price · checked 24 Oct/);await p.context().close();
ok('shared read-only list labels the price "eBay, live price" with its check time');
console.log(log.join('\n'));await b.close()})().catch(e=>{console.error(log.join('\n'));console.error(e);process.exit(1)});
