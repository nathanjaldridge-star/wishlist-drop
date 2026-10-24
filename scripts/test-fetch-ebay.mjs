// Offline tests for scripts/fetch-ebay.mjs against a local mock of the eBay OAuth + Browse APIs (no network, no real keys).
// Run: node scripts/test-fetch-ebay.mjs   (schema checks use ajv from devDependencies when installed)
import http from 'node:http'; import assert from 'node:assert'; import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import * as E from './fetch-ebay.mjs';
const here = dirname(fileURLToPath(import.meta.url)), require = createRequire(import.meta.url);
let V = null;
try { const Ajv = require('ajv/dist/2020'), af = require('ajv-formats'); const ajv = new Ajv({ allErrors: true, strict: false }); af(ajv); const v = ajv.compile(JSON.parse(readFileSync(join(here, '..', 'docs/price-contract.schema.json'), 'utf8'))); V = (r, t) => { if (!v(r)) throw new Error(`${t} invalid: ${JSON.stringify(v.errors)} ${JSON.stringify(r)}`); }; } catch { console.log('(ajv not installed: schema checks skipped; run npm install)'); }
const ok = (m) => console.log('✓ ' + m);

// ---- pure helpers
assert.equal(E.toPence('123.45'), 12345); assert.equal(E.toPence('10'), 1000); assert.equal(E.toPence('0.5'), 50); assert.equal(E.toPence('19.99'), 1999);
assert.equal(E.toPence('1,234.56'), 123456); assert.equal(E.toPence('0.07'), 7); assert.equal(E.toPence('4.999'), 499); assert.equal(E.toPence('abc'), null); assert.equal(E.toPence(''), null); assert.equal(E.toPence(null), null);
assert.equal(E.toPence('-5'), null);
ok('pence conversion: "123.45"→12345, "10"→1000, "0.5"→50, "19.99"→1999 (no float drift), junk → null');
const w = { id: 'xm5', title: 'Sony WH-1000XM5', query: 'Sony WH-1000XM5', must: ['sony', 'wh1000xm5'], exclude: ['ear pads'], min_price_pence: 12000 };
assert.ok(E.titleMatches('Sony WH-1000XM5 Wireless Noise Cancelling Headphones Black', w));
assert.ok(!E.titleMatches('Replacement Ear Pads for Sony WH-1000XM5', w)); assert.ok(!E.titleMatches('Case compatible with Sony WH-1000XM5', w)); assert.ok(!E.titleMatches('Sony WH-1000XM4 headphones', w));
ok('title matching: must tokens (hyphen-insensitive), default + item excludes reject accessories');
const st = E.stats([250, 260, 270, 280, 290, 900, 20].map((p) => ({ price: p * 100 })));
assert.deepEqual([st.lowest, st.median, st.mean, st.count, st.trimmed], [25000, 27000, 27000, 5, 2]);
assert.equal(E.stats([{ price: 100 }, { price: 300 }]).median, 200); assert.equal(E.stats([]), null);
ok('stats: Tukey trim drops £20 and £900 outliers → lowest £250, median £270, mean £270, count 5, trimmed 2');

// ---- mock eBay
const L = (id, title, value, extra = {}) => ({ itemId: `v1|${id}|0`, legacyItemId: id, title, price: { value, currency: 'GBP' }, buyingOptions: ['FIXED_PRICE'], conditionId: '1000', condition: 'New',
  itemWebUrl: `https://www.ebay.co.uk/itm/${id}?hash=item123&amdata=enc%3Axyz`, shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '0.00', currency: 'GBP' } }], ...extra });
const SEARCH = {
  'Sony WH-1000XM5': { href: 'x', total: 7, itemSummaries: [L('111', 'Sony WH-1000XM5 Headphones Black', '279.00'), L('112', 'Sony WH-1000XM5 Wireless Silver', '249.99', { shippingOptions: [{ shippingCost: { value: '3.49', currency: 'GBP' } }] }),
    L('113', 'Sony WH-1000XM5 Midnight Blue', '289.00'), L('114', 'Sony WH-1000XM5 NEW sealed', '265.00'), L('115', 'Sony WH-1000XM5 bundle', '899.00'),
    L('116', 'Sony WH-1000XM5 used', '150.00', { conditionId: '3000' }), L('117', 'Sony WH-1000XM5 auction', '130.00', { buyingOptions: ['AUCTION'] }), L('118', 'Sony WH-1000XM5 USD', '200.00', { price: { value: '200.00', currency: 'USD' } }),
    L('119', 'Replacement ear pads for Sony WH-1000XM5', '19.99')] },
  'Nothing here': { href: 'x', total: 0, limit: 50, offset: 0 },
  'Weird shape': { results: [] },
};
let hits = [], mode = {};
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); hits.push({ path: u.pathname, q: u.searchParams.get('q'), filter: u.searchParams.get('filter'), auth: req.headers.authorization, mkt: req.headers['x-ebay-c-marketplace-id'], body, ct: req.headers['content-type'] });
    if (u.pathname === '/identity/v1/oauth2/token') {
      if (mode.token === '401') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_client"}'); }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ access_token: 'v^1.1#TEST-TOKEN', expires_in: 7200, token_type: 'Application Access Token' }));
    }
    if (u.pathname === '/buy/browse/v1/item_summary/search') {
      if (req.headers.authorization !== 'Bearer v^1.1#TEST-TOKEN') { res.writeHead(401); return res.end('{}'); }
      if (mode[u.searchParams.get('q')] === '429') { res.writeHead(429, { 'content-type': 'application/json' }); return res.end('{"errors":[{"errorId":2001,"message":"Too many requests"}]}'); }
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(SEARCH[u.searchParams.get('q')] || { href: 'x', total: 0 }));
    }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => srv.listen(0, r));
const dir = mkdtempSync(join(tmpdir(), 'ebay-')), OUT = join(dir, 'ebay.json'), LOG = join(dir, 'price-log.jsonl'), WL = join(dir, 'watchlist.json');
writeFileSync(WL, JSON.stringify({ version: 1, items: [w, { id: 'none', title: 'Nothing', query: 'Nothing here' }, { id: 'weird', title: 'Weird', query: 'Weird shape' }] }));
Object.assign(process.env, { EBAY_API_BASE: `http://127.0.0.1:${srv.address().port}`, EBAY_OUT: OUT, EBAY_LOG: LOG, EBAY_WATCHLIST: WL, EBAY_DELAY_MS: '0', EBAY_TIMEOUT_MS: '2000' });
const logLines = () => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const capture = async (fn) => { const o = console.log, out = []; console.log = (...a) => out.push(a.join(' ')); try { const r = await fn(); return { r, out: out.join('\n') }; } finally { console.log = o; } };

// missing secrets
for (const ks of [{}, { EBAY_CLIENT_ID: 'id' }, { EBAY_CLIENT_SECRET: 's' }]) {
  delete process.env.EBAY_CLIENT_ID; delete process.env.EBAY_CLIENT_SECRET; Object.assign(process.env, ks); hits = [];
  const { r, out } = await capture(() => E.run()); assert.ok(r.skipped); assert.match(out, /eBay keys not set yet – skipping/); assert.equal(hits.length, 0); assert.ok(!existsSync(OUT));
}
ok('missing EBAY_CLIENT_ID and/or EBAY_CLIENT_SECRET → "eBay keys not set yet – skipping", no calls, nothing written');

// happy path
Object.assign(process.env, { EBAY_CLIENT_ID: 'test-client-id', EBAY_CLIENT_SECRET: 'test-secret', EBAY_NOW: '2026-10-24T12:00:00Z' }); hits = [];
let { r } = await capture(() => E.run());
const th = hits.find((h) => h.path.endsWith('/token'));
assert.equal(th.auth, 'Basic ' + Buffer.from('test-client-id:test-secret').toString('base64')); assert.equal(th.ct, 'application/x-www-form-urlencoded');
const tb = new URLSearchParams(th.body); assert.equal(tb.get('grant_type'), 'client_credentials'); assert.equal(tb.get('scope'), 'https://api.ebay.com/oauth/api_scope');
ok('token: POST /identity/v1/oauth2/token, Basic base64(id:secret), grant_type=client_credentials, scope=https://api.ebay.com/oauth/api_scope');
const sh = hits.filter((h) => h.path.endsWith('/search'));
assert.equal(sh.length, 3); assert.ok(sh.every((h) => h.mkt === 'EBAY_GB' && h.auth === 'Bearer v^1.1#TEST-TOKEN')); assert.match(sh[0].filter, /buyingOptions:\{FIXED_PRICE\}/); assert.match(sh[0].filter, /conditionIds:\{1000\}/); assert.match(sh[0].filter, /deliveryCountry:GB/);
assert.equal(r.calls, 4);
ok('search: 1 token + 1 call per item, Bearer token, X-EBAY-C-MARKETPLACE-ID: EBAY_GB, filter new + Buy It Now + UK delivery');
const J = JSON.parse(readFileSync(OUT, 'utf8')), [x, nf, ch] = J.items;
assert.equal(x.error_state, 'ok'); assert.equal(x.source, 'ebay_browse'); assert.equal(x.current_price, 24999); assert.equal(x.delivery_cost, 349); assert.equal(x.product_id, 'ebay:112');
assert.equal(x.canonical_url, 'https://www.ebay.co.uk/itm/112'); assert.equal(x.was_price, null); assert.equal(x.fetched_at, '2026-10-24T12:00:00Z'); assert.equal(x.watch_id, 'xm5');
assert.deepEqual(x.market_stats, { lowest: 24999, median: 27200, mean: 27075, count: 4, trimmed: 1, basis: 'new, Buy It Now, GBP, item price excl. delivery' });
assert.ok(x.confidence > 0.8);
ok('parsing: used/auction/USD/accessory listings dropped, £899 outlier trimmed → lowest £249.99 (+£3.49 delivery) at ebay:112, median £272 of 4, URL query stripped (no affiliate params)');
assert.equal(nf.error_state, 'not_found'); assert.equal(nf.current_price, null); assert.equal(ch.error_state, 'changed');
ok('not_found when eBay has no matching listings; changed when the response loses itemSummaries');
if (V) { J.items.forEach((rec, i) => V(rec, 'ebay' + i)); logLines().forEach((l, i) => V(l, 'log' + i)); ok('every snapshot record and price-log line validates against price-contract.schema.json'); }
assert.equal(logLines().length, 3);
// re-run unchanged within 24h → no new log lines; history kept
process.env.EBAY_NOW = '2026-10-24T12:30:00Z'; await capture(() => E.run()); assert.equal(logLines().length, 3);
process.env.EBAY_NOW = '2026-10-25T12:31:00Z'; await capture(() => E.run()); assert.equal(logLines().length, 6);
ok('price log is append-only and only grows on a change or once per 24h');

// 429 → blocked and stop; later items keep previous record
mode = { 'Sony WH-1000XM5': '429' }; hits = []; process.env.EBAY_NOW = '2026-10-25T13:00:00Z';
({ r } = await capture(() => E.run()));
const J2 = JSON.parse(readFileSync(OUT, 'utf8'));
assert.equal(J2.items[0].error_state, 'blocked'); assert.match(J2.items[0].error_detail, /429/); assert.equal(J2.status, 'rate_limited');
assert.equal(hits.filter((h) => h.path.endsWith('/search')).length, 1, 'kept calling after 429');
assert.equal(J2.items[1].error_state, 'not_found'); assert.equal(J2.items[1].fetched_at, '2026-10-25T12:31:00Z');
if (V) J2.items.forEach((rec, i) => V(rec, '429-' + i));
ok('HTTP 429 → item blocked ("eBay rate limit"), run stops at once, untouched items keep their previous record and time');

// bad keys → keep previous, status blocked, exit normally
mode = { token: '401' }; hits = [];
await capture(() => E.run()); const J3 = JSON.parse(readFileSync(OUT, 'utf8'));
assert.equal(J3.status, 'blocked'); assert.equal(hits.length, 1); assert.equal(J3.items.length, 3);
ok('token HTTP 401 → no searches, status blocked, previous records kept');

// politeness: call cap
mode = {}; process.env.EBAY_MAX_CALLS = '2'; hits = [];
await capture(() => E.run()); assert.equal(hits.length, 2); delete process.env.EBAY_MAX_CALLS;
ok('per-run call cap respected (EBAY_MAX_CALLS)');

// real watch list is well-formed
const real = JSON.parse(readFileSync(join(here, '..', 'data/watchlist.json'), 'utf8'));
assert.ok(real.items.length >= 10 && real.items.every((i) => i.id && i.title && i.query && Array.isArray(i.must)) && new Set(real.items.map((i) => i.id)).size === real.items.length);
ok(`data/watchlist.json: ${real.items.length} seed items, unique ids`);
srv.close();
