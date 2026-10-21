// Mirrors the public HotUKDeals RSS into data/hukd.json so the static site can read it same-origin (no CORS).
// Node 20+, no dependencies. Community-reported data; respect HotUKDeals terms and keep polling polite (30 min).
//
// Robustness:
//  - Conditional GET: sends If-None-Match / If-Modified-Since from the previous mirror; 304 => no write, no commit.
//  - Hard timeout (HUKD_TIMEOUT_MS, default 15000) via AbortSignal, one retry on network error/5xx with backoff.
//  - Validation before overwrite: size limits, well-formed RSS shape (<rss>, <channel>, >= HUKD_MIN_ITEMS items each
//    with <title> and <link>), and a sanity check against a sudden collapse in item count. Bad feed => keep previous mirror.
//  - Atomic write (tmp file + rename). Never exits non-zero for upstream problems (the workflow should not go red because
//    HotUKDeals hiccupped); prints a GitHub ::warning:: instead. Exits 1 only on local bugs (e.g. unwritable output).
// Env (for tests): HUKD_URL, HUKD_OUT, HUKD_TIMEOUT_MS, HUKD_MIN_ITEMS, HUKD_RETRY_MS.
import { writeFileSync, readFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.HUKD_URL || 'https://www.hotukdeals.com/rss/hot';
const OUT = process.env.HUKD_OUT || 'data/hukd.json';
const TIMEOUT = +process.env.HUKD_TIMEOUT_MS || 15000;
const MIN_ITEMS = +process.env.HUKD_MIN_ITEMS || 5;
const RETRY_MS = process.env.HUKD_RETRY_MS != null ? +process.env.HUKD_RETRY_MS : 5000;
const MAX_BYTES = 5 * 1024 * 1024;
const UA = 'DropClub/0.2 (+https://github.com/nathanjaldridge-star/wishlist-drop)';

const warn = (m) => { console.log(`::warning::hukd mirror: ${m}`); };
const done = (m) => { console.log(m); process.exit(0); };

function readPrev() {
  if (!existsSync(OUT)) return null;
  try { const j = JSON.parse(readFileSync(OUT, 'utf8')); return j && typeof j.xml === 'string' ? j : null; }
  catch { warn('previous mirror unreadable; will replace it if the new feed validates'); return null; }
}

export function validate(xml, prevCount) {
  const errs = [];
  if (typeof xml !== 'string' || xml.length < 500) errs.push('body too small');
  if (xml.length > MAX_BYTES) errs.push('body too large');
  if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml) || !/<\/channel>\s*<\/rss>\s*$/i.test(xml.trim())) errs.push('not a complete RSS document');
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  if (items.length < MIN_ITEMS) errs.push(`only ${items.length} <item> elements (need >= ${MIN_ITEMS})`);
  const bad = items.filter((it) => !/<title>[\s\S]*?\S[\s\S]*?<\/title>/.test(it) || !/<link>\s*https?:\/\/[^<\s]+\s*<\/link>/.test(it)).length;
  if (items.length && bad / items.length > 0.2) errs.push(`${bad}/${items.length} items missing <title>/<link>`);
  if (prevCount && items.length < Math.max(MIN_ITEMS, Math.floor(prevCount * 0.25))) errs.push(`item count collapsed ${prevCount} -> ${items.length}`);
  return { ok: !errs.length, errs, count: items.length };
}

async function get(headers) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(URL, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if (res.status >= 500 && attempt === 1) { warn(`HTTP ${res.status}, retrying`); await new Promise((r) => setTimeout(r, RETRY_MS)); continue; }
      return res;
    } catch (e) {
      const why = e.name === 'TimeoutError' || e.name === 'AbortError' ? `timed out after ${TIMEOUT}ms` : e.message;
      if (attempt === 1) { warn(`${why}, retrying`); await new Promise((r) => setTimeout(r, RETRY_MS)); continue; }
      throw new Error(why);
    }
  }
}

async function main() {
  const prev = readPrev();
  const headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' };
  if (prev?.etag) headers['If-None-Match'] = prev.etag;
  if (prev?.last_modified) headers['If-Modified-Since'] = prev.last_modified;
  let res;
  try { res = await get(headers); } catch (e) { warn(`fetch failed (${e.message}); keeping previous mirror`); return done('kept'); }
  if (res.status === 304) return done('not modified (304)');
  if (!res.ok) { warn(`HTTP ${res.status}; keeping previous mirror`); return done('kept'); }
  const len = +res.headers.get('content-length');
  if (len && len > MAX_BYTES) { warn(`content-length ${len} too large; keeping previous mirror`); return done('kept'); }
  const xml = await res.text();
  const prevCount = prev ? (prev.xml.match(/<item[\s>]/g) || []).length : 0;
  const v = validate(xml, prevCount);
  if (!v.ok) { warn(`feed failed validation (${v.errs.join('; ')}); keeping previous mirror`); return done('kept'); }
  if (prev && prev.xml === xml) return done('unchanged');
  const out = {
    source_url: URL, final_url: res.url, fetched_at: new Date().toISOString(),
    etag: res.headers.get('etag') || null, last_modified: res.headers.get('last-modified') || null,
    item_count: v.count, label: 'Community reported (HotUKDeals RSS)', xml,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  const tmp = OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify(out) + '\n');
  renameSync(tmp, OUT);
  done(`updated ${v.count} items`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
