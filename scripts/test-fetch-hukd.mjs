// Offline tests for scripts/fetch-hukd.mjs against a local HTTP server (no network). Run: node scripts/test-fetch-hukd.mjs
import http from 'node:http'; import { execFile } from 'node:child_process'; import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert';
const here = dirname(fileURLToPath(import.meta.url)), script = join(here, 'fetch-hukd.mjs');
const item = ({ id, title, merchant = 'Amazon', price = '£10', discount, temp = 100, pub = 'Wed, 21 Oct 2026 19:00:00 +0100', desc = 'Nice deal' }) =>
  `<item><title>${temp}° - ${title}</title><link>https://www.hotukdeals.com/deals/${id}</link><guid>https://www.hotukdeals.com/deals/${id}</guid><pubDate>${pub}</pubDate><category>Tech</category><description><![CDATA[<p>${desc}</p>]]></description><pepper:merchant name="${merchant}"${price ? ` price="${price}"` : ''}${discount ? ` discount="${discount}"` : ''}/></item>`;
const feed = (items) => `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:pepper="http://www.pepper.com/rss"><channel><title>t</title>${items.map(item).join('')}</channel></rss>\n`;
const many = (n, pre, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `${pre}-deal-${i}-${1000 + i}`, title: `${pre} thing ${i}`, ...extra }));
let F = {}, hits = [], mode = {};
const srv = http.createServer((req, res) => {
  hits.push({ path: req.url, inm: req.headers['if-none-match'] || null, ims: req.headers['if-modified-since'] || null, ua: req.headers['user-agent'] });
  const m = mode[req.url] || 'ok';
  if (m === '500') { res.writeHead(500); return res.end('x'); }
  if (m === 'garbage') { res.writeHead(200); return res.end('<html>' + 'challenge '.repeat(80) + '</html>'); }
  if (m === 'slow') { setTimeout(() => { try { res.writeHead(200); res.end(F[req.url]); } catch {} }, 2500); return; }
  if (m === 'etag') { if (req.headers['if-none-match'] === '"e1"') { res.writeHead(304); return res.end(); } res.writeHead(200, { etag: '"e1"', 'last-modified': 'Wed, 21 Oct 2026 18:00:00 GMT' }); return res.end(F[req.url]); }
  if (!F[req.url]) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': 'application/rss+xml' }); res.end(F[req.url]);
});
await new Promise((r) => srv.listen(0, r));
const dir = mkdtempSync(join(tmpdir(), 'hukd-')), OUT = join(dir, 'data', 'hukd.json'), LOG = join(dir, 'data', 'price-log.jsonl');
const run = (now, env = {}) => { hits = []; return new Promise((res) => execFile(process.execPath, [script], { env: { ...process.env, HUKD_BASE: `http://127.0.0.1:${srv.address().port}`, HUKD_OUT: OUT, HUKD_LOG: LOG, HUKD_NOW: now, HUKD_TIMEOUT_MS: '700', HUKD_RETRY_MS: '20', ...env } }, (err, so, se) => res({ code: err ? err.code : 0, out: so + se }))); };
const J = () => JSON.parse(readFileSync(OUT, 'utf8')), L = () => existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const ok = (m) => console.log('✓ ' + m); const paths = () => hits.map((h) => h.path).sort();
F['/rss/new'] = feed([...many(28, 'new'), { id: 'skip-1', title: 'Pizza', merchant: 'Dominos' }, { id: 'nomer-2', title: 'No merchant', merchant: '' }, { id: 'jl-3', title: 'John Lewis kettle', merchant: 'John Lewis & Partners', price: '£49.99' }]);
F['/rss/hot'] = feed([{ id: 'hot-a-1', title: 'Sony WH-1000XM5 Headphones', price: '£199', temp: 900 }, { id: 'hot-b-2', title: 'Sony WH-1000XM5 Headphones', price: '£199', temp: 300 }, ...many(8, 'hot')]);
F['/rss/vouchers'] = feed([{ id: 'v-1', title: '20% off gift sets', merchant: 'Boots', price: null, discount: '20%', desc: 'Use code <strong>GIFT20</strong> at checkout' }]);
for (const t of ['lego', 'headphones', 'apple', 'gaming']) F['/rss/tag/' + t] = feed(many(3, 'tag' + t, { merchant: 'Argos', price: '£25' }));
const T0 = '2026-10-21T19:00:00Z';
let r = await run(T0); assert.equal(r.code, 0, r.out);
assert.deepEqual(paths(), ['/rss/hot', '/rss/new', '/rss/tag/apple', '/rss/tag/gaming', '/rss/tag/headphones', '/rss/tag/lego', '/rss/vouchers']); ok('first run fetches /rss/new, /rss/hot, /rss/vouchers and 4 /rss/tag/* feeds');
assert.ok(hits.every((h) => /DropClub\/.*github\.com/.test(h.ua))); ok('single UA with contact info');
let j = J(); const g = (id) => j.deals.find((d) => d.guid.endsWith(id));
assert.ok(!g('skip-1') && !g('nomer-2'), 'merchant filter'); assert.ok(g('jl-3'), 'John Lewis & Partners kept'); ok('pepper:merchant filter: Dominos + no-merchant dropped, "John Lewis & Partners" kept');
assert.ok(j.deals.every((d) => /^https:\/\/www\.hotukdeals\.com\/deals\//.test(d.link))); assert.ok(!JSON.stringify(j).includes('<p>')); ok('every deal keeps its HUKD thread link; no description HTML stored');
const v = g('v-1'); assert.equal(v.kind, 'voucher'); assert.equal(v.discount, '20%'); assert.deepEqual(v.codes, ['GIFT20']); assert.equal(v.price, null); ok('voucher parsed (discount, code string only, no price)');
assert.ok(g('hot-a-1') && !g('hot-b-2') && g('hot-a-1').dupes.some((x) => x.endsWith('hot-b-2'))); ok('cross-posts deduped (same merchant+title+price within 48h) keeping the hottest thread');
assert.ok(g('hot-a-1').trending_seen && g('jl-3').trending_seen === null); assert.equal(g('jl-3').price, 4999); ok('trending_seen set from /rss/hot; price in pence');
let log = L(); assert.equal(log.length, j.deals.length + 1); assert.ok(log.every((l) => l.source === 'hukd_rss' && l.observed_at === T0 && l.link && l.label === 'community reported')); ok('price log: one line per first-seen thread (incl. the deduped cross-post), community reported, observed_at');
r = await run('2026-10-21T19:03:00Z'); assert.equal(hits.length, 0, 'nothing due'); assert.equal(L().length, log.length); ok('cadence: nothing re-fetched 3 min later');
F['/rss/new'] = F['/rss/new'].replace('<pepper:merchant name="John Lewis &amp; Partners" price="£49.99"/>', '<pepper:merchant name="John Lewis &amp; Partners" price="£39.99"/>').replace('name="John Lewis & Partners" price="£49.99"', 'name="John Lewis & Partners" price="£39.99"');
r = await run('2026-10-21T19:05:00Z'); assert.deepEqual(paths(), ['/rss/new']); const nl = L().slice(log.length); assert.equal(nl.length, 1); assert.equal(nl[0].price, 3999); assert.equal(nl[0].change, 'price'); ok('5 min later only /rss/new is due; a price change appends exactly one log line (append-only, earlier lines untouched)');
assert.deepEqual(L().slice(0, log.length), log); log = L();
r = await run('2026-10-21T19:15:00Z'); assert.deepEqual(paths(), ['/rss/hot', '/rss/new']); ok('15 min: /rss/new + /rss/hot; vouchers/tags wait for 30 min');
r = await run('2026-11-24T12:00:00Z'); r = await run('2026-11-24T12:02:00Z'); assert.deepEqual(paths(), ['/rss/new']); assert.match(r.out, /Black Friday week/); assert.equal(J().stale_after_hours, 24); ok('Black Friday week (24 Nov): /rss/new due every 2 min, stale_after_hours 24');
r = await run('2026-12-02T12:00:00Z'); r = await run('2026-12-02T12:02:00Z'); assert.equal(hits.length, 0); assert.equal(J().stale_after_hours, 48); ok('2 Dec: back to 5-min cadence, 48h staleness');
F['/rss/new'] = feed(many(30, 'fresh')); r = await run('2026-12-02T12:10:00Z'); assert.match(r.out, /window probably missed/); ok('overflow warning when all 30 /rss/new items are unseen');
const before = J(); mode['/rss/new'] = 'garbage'; mode['/rss/hot'] = '500'; mode['/rss/vouchers'] = 'slow';
r = await run('2026-12-02T13:00:00Z'); assert.equal(r.code, 0); assert.match(r.out, /new: failed validation/); assert.match(r.out, /hot.*HTTP 500/); assert.match(r.out, /vouchers.*timed out/); assert.equal(hits.filter((h) => h.path === '/rss/hot').length, 2); assert.ok(J().deals.length >= before.deals.length - 0); ok('garbage / 500 (retried once) / timeout → ::warning::, previous deals kept, exit 0');
mode = { '/rss/new': 'etag' }; F['/rss/new'] = feed(many(10, 'et')); r = await run('2026-12-02T14:00:00Z', { HUKD_FORCE: '1' }); r = await run('2026-12-02T14:10:00Z'); const h = hits.find((x) => x.path === '/rss/new'); assert.equal(h.inm, '"e1"'); assert.ok(h.ims); assert.match(r.out, /new: 304/); ok('conditional GET: If-None-Match + If-Modified-Since sent, 304 handled');
r = await run('2026-12-20T14:00:00Z', { HUKD_FORCE: '1' }); assert.ok(J().deals.every((d) => new Date(d.last_seen) >= new Date('2026-12-13T14:00:00Z'))); ok('deals not seen for 7 days are dropped from the mirror (log keeps them)');
assert.ok(!existsSync(OUT + '.tmp')); writeFileSync(OUT, '{bad'); r = await run('2026-12-20T15:00:00Z', { HUKD_FORCE: '1' }); assert.equal(r.code, 0); assert.match(r.out, /unreadable/); assert.equal(J().version, 2); ok('atomic write; corrupt previous mirror → rebuilt');
srv.close(); console.log('fetch-hukd tests passed');
