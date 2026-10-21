// Offline test for scripts/fetch-hukd.mjs against a local HTTP server. Run: node scripts/test-fetch-hukd.mjs
import http from 'node:http'; import { execFileSync } from 'node:child_process'; import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import assert from 'node:assert';
const here = dirname(fileURLToPath(import.meta.url)), script = join(here, 'fetch-hukd.mjs');
const item = (i) => `<item><title>Deal ${i} £${i}.99</title><link>https://www.hotukdeals.com/deals/deal-${i}-${1000 + i}</link><guid>https://www.hotukdeals.com/deals/deal-${i}-${1000 + i}</guid><description>x</description></item>`;
const feed = (n) => `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>hot</title>${Array.from({ length: n }, (_, i) => item(i)).join('')}</channel></rss>\n`;
let mode = 'ok', hits = [];
const srv = http.createServer((req, res) => {
  hits.push({ mode, inm: req.headers['if-none-match'] || null, ims: req.headers['if-modified-since'] || null });
  if (mode === 'ok' || mode === 'ok2') { const body = feed(mode === 'ok' ? 20 : 22), et = mode === 'ok' ? '"v1"' : '"v2"';
    if (req.headers['if-none-match'] === et) { res.writeHead(304); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/rss+xml', etag: et, 'last-modified': 'Wed, 21 Oct 2026 18:00:00 GMT' }); return res.end(body); }
  if (mode === 'garbage') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body>' + 'Cloudflare challenge '.repeat(50) + '</body></html>'); }
  if (mode === 'few') { res.writeHead(200); return res.end(feed(2)); }
  if (mode === 'truncated') { res.writeHead(200); return res.end(feed(20).slice(0, -30)); }
  if (mode === '500') { res.writeHead(500); return res.end('err'); }
  if (mode === 'slow') { setTimeout(() => { try { res.writeHead(200); res.end(feed(20)); } catch {} }, 3000); return; }
});
await new Promise((r) => srv.listen(0, r));
const dir = mkdtempSync(join(tmpdir(), 'hukd-')), OUT = join(dir, 'data', 'hukd.json');
const run = (m) => { mode = m; hits = []; return new Promise((res) => { import('node:child_process').then(({ execFile }) => execFile(process.execPath, [script], { env: { ...process.env, HUKD_URL: `http://127.0.0.1:${srv.address().port}/rss`, HUKD_OUT: OUT, HUKD_TIMEOUT_MS: '800', HUKD_RETRY_MS: '50' } }, (err, stdout, stderr) => res({ code: err ? err.code : 0, out: stdout + stderr }))); }); };
const read = () => JSON.parse(readFileSync(OUT, 'utf8'));
const ok = (m) => console.log('✓ ' + m);
let r = await run('ok'); assert.equal(r.code, 0); assert.match(r.out, /updated 20 items/); let j = read(); assert.equal(j.etag, '"v1"'); assert.equal(j.item_count, 20); assert.ok(j.last_modified); ok('first fetch writes mirror with etag/last-modified/item_count');
const m1 = statSync(OUT).mtimeMs; r = await run('ok'); assert.match(r.out, /not modified \(304\)/); assert.equal(hits[0].inm, '"v1"'); assert.ok(hits[0].ims); assert.equal(statSync(OUT).mtimeMs, m1); ok('second fetch sends If-None-Match + If-Modified-Since, 304 → no write');
for (const [m, re] of [['garbage', /failed validation/], ['few', /only 2 <item>/], ['truncated', /not a complete RSS/], ['500', /HTTP 500/], ['slow', /timed out after 800ms/]]) {
  r = await run(m); assert.equal(r.code, 0, m + ' exit'); assert.match(r.out, re, m + ': ' + r.out); assert.match(r.out, /::warning::/); assert.deepEqual(read().etag, '"v1"', m + ' overwrote mirror'); if (m === '500' || m === 'slow') assert.equal(hits.length, 2, m + ' should retry once');
  ok(`${m} → warning, previous mirror kept, exit 0${m === '500' || m === 'slow' ? ', retried once' : ''}`); }
r = await run('ok2'); assert.match(r.out, /updated 22 items/); assert.equal(read().etag, '"v2"'); ok('changed feed (new etag) → mirror updated');
writeFileSync(OUT, '{not json'); r = await run('ok2'); assert.equal(r.code, 0); assert.match(r.out, /unreadable/); assert.equal(read().item_count, 22); ok('corrupt previous mirror → replaced by valid feed');
assert.ok(!existsSync(OUT + '.tmp')); ok('atomic write leaves no tmp file');
srv.close(); console.log('fetch-hukd tests passed');
