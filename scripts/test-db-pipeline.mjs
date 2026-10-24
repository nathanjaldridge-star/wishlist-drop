// End-to-end: the real eBay fetcher (against a local mock of eBay) -> price-log.jsonl -> ingest into Postgres (PGlite) ->
// export prices.json -> the built app (index.html in Chromium) finds the price history from a TYPED product name.
// No network, no real keys, no DATABASE_URL. Run: node scripts/test-db-pipeline.mjs (after npm run build)
import http from 'node:http'; import assert from 'node:assert/strict'; import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from './db/migrate.mjs'; import { ingest, readJsonl } from './db/ingest.mjs'; import { exportSummary } from './db/export.mjs';
import * as E from './fetch-ebay.mjs';
delete process.env.DATABASE_URL;
const require = createRequire(import.meta.url), { chromium } = require('playwright-core');
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), ok = (m) => console.log('✓ ' + m);
const watchlist = JSON.parse(readFileSync(join(root, 'data/watchlist.json'), 'utf8')), w = watchlist.items.find((x) => x.id === 'sony-wh-1000xm5');
const NOW = '2026-10-24T12:00:00Z';

// 1. real fetcher, mock eBay
const L = (id, v) => ({ itemId: `v1|${id}|0`, legacyItemId: id, title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', price: { value: v, currency: 'GBP' },
  buyingOptions: ['FIXED_PRICE'], conditionId: '1000', itemWebUrl: `https://www.ebay.co.uk/itm/${id}`, shippingOptions: [{ shippingCost: { value: '0.00', currency: 'GBP' } }] });
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.writeHead(200, { 'content-type': 'application/json' });
  if (u.pathname.endsWith('/token')) return res.end(JSON.stringify({ access_token: 'T', expires_in: 7200 }));
  res.end(JSON.stringify(u.searchParams.get('q') === w.query ? { total: 4, itemSummaries: [L('201', '259.00'), L('202', '265.00'), L('203', '270.00'), L('204', '279.00')] } : { total: 0 }));
});
await new Promise((r) => srv.listen(0, r));
const dir = mkdtempSync(join(tmpdir(), 'dc-e2e-'));
Object.assign(process.env, { EBAY_API_BASE: `http://127.0.0.1:${srv.address().port}`, EBAY_OUT: join(dir, 'ebay.json'), EBAY_LOG: join(dir, 'price-log.jsonl'),
  EBAY_WATCHLIST: join(root, 'data/watchlist.json'), EBAY_DELAY_MS: '0', EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 's', EBAY_NOW: NOW });
const log0 = console.log; console.log = () => {}; try { await E.run(); } finally { console.log = log0; }
srv.close();
const log = readJsonl(join(dir, 'price-log.jsonl'));
assert.equal(log.length, watchlist.items.length);
assert.equal(log.find((l) => l.watch_id === w.id).catalogue_id, w.catalogue_id);
ok(`fetcher: ${log.length} log lines, each carrying its watch-list catalogue id`);

// 2. ingest + 31 days of EXAMPLE shop captures for the same product (user_capture is off in production until it exists)
const pg = new PGlite(); await pg.exec("set time zone 'UTC'");
const wrap = (c) => ({ query: (s, p) => c.query(s, p), exec: (s) => c.exec(s) });
const db = { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))) };
await migrate(db); await db.query("update sources set enabled = true where id = 'user_capture'");
const day = (d) => new Date(Date.parse(NOW) - d * 864e5).toISOString();
const captures = Array.from({ length: 32 }, (_, d) => ({ source: 'user_capture', product_id: 'argos:8349024', retailer: 'Argos', canonical_url: 'https://www.argos.co.uk/product/8349024',
  title: '[EXAMPLE] capture', current_price: d === 0 ? 24900 : 27900, currency: 'GBP', fetched_at: day(d), confidence: 0.8, error_state: 'ok', catalogue_id: w.catalogue_id }));
// A different product at another shop, which must never show on the Sony card.
const sw = watchlist.items.find((x) => x.id === 'switch-oled');
const other = [{ ...captures[0], product_id: 'currys:10240001', retailer: 'Currys', canonical_url: 'https://www.currys.co.uk/products/x-10240001.html', current_price: 29900, catalogue_id: sw.catalogue_id }];
const r = await ingest(db, [...log, ...captures, ...other], { watchlist, now: NOW });
assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected)); assert.equal(r.inserted, log.length + captures.length + other.length);
const j = await exportSummary(db, '2026-10-24T12:20:00Z'); await pg.close();
const sony = j.items.filter((i) => i.catalogue_id === w.catalogue_id);
assert.deepEqual(sony.map((i) => [i.source, i.retailer, i.current_price, i.low_30d, i.building_history]).sort(),
  [['ebay_browse', 'ebay-uk', 25900, null, false], ['user_capture', 'argos-uk', 24900, 27900, false]]);
ok('ingest + export: eBay row (no history maths) and Argos row (30-day low £279) under the same catalogue id');
writeFileSync(join(dir, 'prices.json'), JSON.stringify(j));

// 3. the built app reads prices.json and finds it from a typed name
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
async function addTyped(withEbay) {
  const ctx = await b.newContext();
  await ctx.route('**/prices.json', (q) => q.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(dir, 'prices.json')) }));
  await ctx.route('**/ebay.json', (q) => withEbay ? q.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(join(dir, 'ebay.json')) }) : q.fulfill({ status: 404, body: 'nf' }));
  await ctx.addInitScript(() => { window.WD_SKIP_LIVE = true; window.WD_CLOCK = '2026-10-24T12:30:00Z'; window.WD_EBAY = 'https://qa.invalid/ebay.json'; window.WD_PRICES = 'https://qa.invalid/prices.json'; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.exposeFunction('WD_DIALOG_HOOK', (m, t) => (t == 'prompt' ? '279.00' : true));
  await p.goto('file://' + join(root, 'index.html')); await p.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  await p.fill('#what', 'sony wh1000xm5 headphones'); await p.evaluate(() => WD.preview());
  if (!(await p.inputValue('#price'))) await p.fill('#price', '279');
  await p.click('#submitBtn'); await p.waitForTimeout(400);
  const byCid = await p.evaluate((c) => { const m = WD.ebay.lookup({ name: 'birthday present for dad', cid: c }); return m && m.r.catalogue_id; }, withEbay ? JSON.parse(readFileSync(join(root, 'data/watchlist.json'), 'utf8')).items.find((x) => x.id === 'sony-wh-1000xm5').catalogue_id : null);
  const out = { byCid,cid: await p.evaluate(() => JSON.parse(localStorage.getItem('wishlistDrop.v2')).items[0].cid),
    card: await p.textContent('#cards'), errs };
  await ctx.close(); return out;
}
let a = await addTyped(true);
assert.equal(a.cid, w.catalogue_id); assert.match(a.card, /Drop Club 30-day low at Argos: £279\.00 \(now £249\.00\)/); assert.doesNotMatch(a.card, /Currys/, 'another product\'s prices never show'); assert.doesNotMatch(a.card, /DC[0-9A-Z]{10}/, 'raw ids stay off the card');
assert.deepEqual(a.errs, []); assert.equal(a.byCid, w.catalogue_id, 'an item whose name matches nothing is still found by its catalogue id');
ok('app (eBay live): an item is found by catalogue id even when its name matches nothing; typing "sony wh1000xm5 headphones" links the item to its catalogue id and shows "Drop Club 30-day low at Argos: £279.00 (now £249.00)"');
a = await addTyped(false);
assert.equal(a.cid, w.catalogue_id); assert.match(a.card, /Drop Club 30-day low at Argos/);
ok('app (no eBay data): the typed name still finds the product through prices.json catalogue titles');
await b.close();
console.log('db pipeline: ok');
