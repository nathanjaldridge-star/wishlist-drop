// Drop Club HotUKDeals mirror. Node 20+, no dependencies.
// Fetches ONLY public HotUKDeals RSS feeds (/rss/new, /rss/hot, /rss/vouchers, /rss/tag/{tag}); robots.txt allows /rss/.
// It never fetches retailer pages (no server-side scraping) and never stores description HTML: only title, thread link,
// merchant, listed price/discount, pubDate, temperature, category and community-posted code strings (labelled unverified).
//
// Output (HUKD_OUT, default data/hukd.json): { version:2, generated_at, feeds:{name:{url,last_fetched,etag,last_modified,status,items}},
//   deals:[{id,guid,link,title,merchant,price,price_str,discount,pub_date,temp,category,codes,feeds,first_seen,last_seen,trending_seen,kind}] }
// Price log (HUKD_LOG, default data/price-log.jsonl): append-only, one JSON line per first sighting of a thread or a price change.
//
// Robustness: per-feed cadence gating (5 min /rss/new, 2 min in Black Friday week 20 Nov-1 Dec Europe/London; trending 15;
// vouchers + tags 30), conditional GET (If-None-Match / If-Modified-Since; HUKD currently sends neither header), 15s timeout,
// one retry on network error/5xx/429 with backoff, validation before use, keep-previous on any upstream problem, overflow warning
// when every /rss/new item is unseen (poll window missed), atomic writes. Upstream problems => ::warning::, exit 0.
// Env (tests): HUKD_BASE, HUKD_OUT, HUKD_LOG, HUKD_CONFIG, HUKD_NOW (ISO), HUKD_FORCE=1, HUKD_TIMEOUT_MS, HUKD_MIN_ITEMS, HUKD_RETRY_MS.
import { writeFileSync, readFileSync, existsSync, renameSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { persistRows, rowFromHukd } from './price-store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(process.env.HUKD_CONFIG || join(here, 'hukd-config.json'), 'utf8'));
const BASE = (process.env.HUKD_BASE || CFG.base).replace(/\/$/, '');
const OUT = process.env.HUKD_OUT || 'data/hukd.json';
const LOG = process.env.HUKD_LOG || join(dirname(OUT), 'price-log.jsonl');
const TIMEOUT = +process.env.HUKD_TIMEOUT_MS || 15000;
const MIN_ITEMS = +process.env.HUKD_MIN_ITEMS || 5;
const RETRY_MS = process.env.HUKD_RETRY_MS != null ? +process.env.HUKD_RETRY_MS : 5000;
const NOW = process.env.HUKD_NOW ? new Date(process.env.HUKD_NOW) : new Date();
const FORCE = process.env.HUKD_FORCE === '1';
const MAX_BYTES = 5 * 1024 * 1024;
const UA = 'DropClub/0.3 (+https://github.com/nathanjaldridge-star/wishlist-drop; contact via GitHub issues)';
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const warn = (m) => console.log(`::warning::hukd mirror: ${m}`);

export function isBfWeek(d = NOW, bf = CFG.bf_week) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: bf.tz, month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  const md = `${p.month}-${p.day}`;
  return bf.from <= bf.to ? md >= bf.from && md <= bf.to : md >= bf.from || md <= bf.to;
}

export function validate(xml, prevCount = 0, min = MIN_ITEMS) {
  const errs = [];
  if (typeof xml !== 'string' || xml.length < 300) errs.push('body too small');
  else {
    if (xml.length > MAX_BYTES) errs.push('body too large');
    if (!/<rss[\s>]/i.test(xml) || !/<channel[\s>]/i.test(xml) || !/<\/channel>\s*<\/rss>\s*$/i.test(xml.trim())) errs.push('not a complete RSS document');
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
    if (items.length < min) errs.push(`only ${items.length} <item> elements (need >= ${min})`);
    const bad = items.filter((it) => !/<title>[\s\S]*?\S[\s\S]*?<\/title>/.test(it) || !/<link>\s*https?:\/\/[^<\s]+\s*<\/link>/.test(it)).length;
    if (items.length && bad / items.length > 0.2) errs.push(`${bad}/${items.length} items missing <title>/<link>`);
    if (prevCount && items.length < Math.max(min, Math.floor(prevCount * 0.25))) errs.push(`item count collapsed ${prevCount} -> ${items.length}`);
  }
  return { ok: !errs.length, errs };
}

const ent = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').trim();
const tag = (it, t) => { const m = it.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? ent(m[1]) : ''; };
const attr = (s, a) => { const m = s.match(new RegExp(`\\s${a}="([^"]*)"`)); return m ? ent(m[1]) : null; };
export function pence(s) { if (!s) return null; const m = String(s).replace(/,/g, '').match(/£\s*(\d+(?:\.\d{1,2})?)/); if (m) return Math.round(+m[1] * 100); const p = String(s).match(/^\s*(\d+)\s*p\b/i); return p ? +p[1] : null; }
export function codesFrom(desc) {
  const txt = String(desc).replace(/<strong>([^<]*)<\/strong>/gi, ' «$1» ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const out = []; const re = /\b(?:voucher|promo|discount)?\s*code[s]?\s*(?:[:\-]|is|of|use)?\s*«?\s*([A-Z0-9][A-Z0-9_-]{3,19})\s*»?(?:\s*(?:or|\/|,)\s*«?\s*([A-Z0-9][A-Z0-9_-]{3,19})\s*»?)?/g; let m;
  while ((m = re.exec(txt))) for (const c of [m[1], m[2]]) if (c && /[A-Z]/.test(c) && out.indexOf(c) < 0) out.push(c);
  return out.slice(0, 3);
}
export function parseItems(xml) {
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []).map((it) => {
    const raw = tag(it, 'title'), tm = raw.match(/^\s*(-?\d+)\s*°\s*-\s*/), mer = (it.match(/<pepper:merchant\b[^>]*>/) || [''])[0];
    const guid = tag(it, 'guid') || tag(it, 'link'), idm = guid.match(/-(\d+)\/?$/), pd = new Date(tag(it, 'pubDate'));
    const priceStr = attr(mer, 'price'), discount = attr(mer, 'discount');
    return { id: idm ? idm[1] : guid, guid, link: tag(it, 'link'), title: raw.replace(/^\s*-?\d+\s*°\s*-\s*/, ''), temp: tm ? +tm[1] : null,
      merchant: attr(mer, 'name'), price: pence(priceStr), price_str: priceStr, discount, pub_date: isNaN(pd) ? null : iso(pd),
      category: tag(it, 'category') || null, codes: codesFrom(tag(it, 'description')), kind: priceStr ? 'deal' : discount ? 'voucher' : 'deal' };
  });
}
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
export function merchantAllowed(name, list = CFG.merchants) { const n = norm(name); if (!n) return false; return list.some((m) => { const k = norm(m); return n === k || n.startsWith(k + ' '); }); }
const titleKey = (t) => norm(t).replace(/\b\d+\s*(?:deg|°)\b/g, '').replace(/\s+/g, ' ');

async function get(url, headers) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if ((res.status >= 500 || res.status === 429) && attempt === 1) { warn(`${url} HTTP ${res.status}, retrying`); await new Promise((r) => setTimeout(r, RETRY_MS * (res.status === 429 ? 3 : 1))); continue; }
      return res;
    } catch (e) {
      const why = e.name === 'TimeoutError' || e.name === 'AbortError' ? `timed out after ${TIMEOUT}ms` : e.message;
      if (attempt === 1) { warn(`${url} ${why}, retrying`); await new Promise((r) => setTimeout(r, RETRY_MS)); continue; }
      throw new Error(why);
    }
  }
}

function readPrev() {
  if (!existsSync(OUT)) return { feeds: {}, deals: [] };
  try { const j = JSON.parse(readFileSync(OUT, 'utf8')); return { feeds: j.feeds || {}, deals: Array.isArray(j.deals) ? j.deals : [] }; }
  catch { warn('previous mirror unreadable; starting fresh'); return { feeds: {}, deals: [] }; }
}

export async function run() {
  const prev = readPrev(), bf = isBfWeek(NOW), nowIso = iso(NOW);
  const feeds = CFG.feeds.map((f) => ({ ...f, every: bf ? f.bf_every_min : f.every_min }))
    .concat((CFG.tags || []).map((t) => ({ name: `tag:${t}`, path: `/rss/tag/${encodeURIComponent(t)}`, every: CFG.tag_every_min })));
  const state = { ...prev.feeds }, byGuid = new Map(prev.deals.map((d) => [d.guid, d])), logLines = [], summary = [];
  for (const f of feeds) {
    const st = state[f.name] || {}, due = FORCE || !st.last_fetched || NOW - new Date(st.last_fetched) >= f.every * 60e3 - 30e3;
    if (!due) { summary.push(`${f.name}: not due (every ${f.every}m)`); continue; }
    const url = BASE + f.path, headers = { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' };
    if (st.etag) headers['If-None-Match'] = st.etag; if (st.last_modified) headers['If-Modified-Since'] = st.last_modified;
    let res; try { res = await get(url, headers); } catch (e) { warn(`${f.name}: ${e.message}; keeping previous`); state[f.name] = { ...st, status: 'error: ' + e.message }; summary.push(`${f.name}: error`); continue; }
    if (res.status === 304) { state[f.name] = { ...st, url, last_fetched: nowIso, status: 304 }; summary.push(`${f.name}: 304`); continue; }
    if (!res.ok) { warn(`${f.name}: HTTP ${res.status}; keeping previous`); state[f.name] = { ...st, url, last_fetched: nowIso, status: res.status }; summary.push(`${f.name}: HTTP ${res.status}`); continue; }
    const xml = await res.text(), v = validate(xml, st.items || 0, f.name.startsWith('tag:') || f.name === 'vouchers' ? 1 : MIN_ITEMS);
    if (!v.ok) { warn(`${f.name}: failed validation (${v.errs.join('; ')}); keeping previous`); state[f.name] = { ...st, url, last_fetched: nowIso, status: 'invalid' }; summary.push(`${f.name}: invalid`); continue; }
    const items = parseItems(xml);
    if (f.name === 'new' && prev.deals.length && items.length >= 30 && items.every((i) => !byGuid.has(i.guid))) warn('/rss/new: all items unseen since last poll; window probably missed, poll faster');
    let kept = 0;
    for (const i of items) {
      if (!merchantAllowed(i.merchant)) continue; kept++;
      const old = byGuid.get(i.guid);
      const d = old ? { ...old, ...i, codes: [...new Set([...(old.codes || []), ...i.codes])].slice(0, 3), feeds: [...new Set([...(old.feeds || []), f.name])], first_seen: old.first_seen, last_seen: nowIso }
                    : { ...i, feeds: [f.name], first_seen: nowIso, last_seen: nowIso, trending_seen: null };
      if (f.name === 'trending') d.trending_seen = nowIso;
      if (!old || old.price !== i.price || old.discount !== i.discount)
        logLines.push({ observed_at: nowIso, source: 'hukd_rss', label: 'community reported', feed: f.name, guid: i.guid, link: i.link, merchant: i.merchant, title: i.title, price: i.price, discount: i.discount, currency: 'GBP', pub_date: i.pub_date, kind: i.kind, change: old ? 'price' : 'new' });
      byGuid.set(i.guid, d);
    }
    state[f.name] = { url, final_url: res.url, last_fetched: nowIso, etag: res.headers.get('etag') || null, last_modified: res.headers.get('last-modified') || null, status: 200, items: items.length, kept };
    summary.push(`${f.name}: ${items.length} items, ${kept} kept`);
  }
  // retain + dedupe cross-posts: same merchant + normalised title + price within 48h -> keep the hottest thread
  const cutoff = NOW - CFG.retain_days * 864e5;
  let deals = [...byGuid.values()].filter((d) => new Date(d.last_seen) >= cutoff);
  const keptDeals = [], seen = new Map();
  for (const d of deals.sort((a, b) => (b.temp ?? -1e9) - (a.temp ?? -1e9))) {
    const k = `${norm(d.merchant)}|${titleKey(d.title)}|${d.price ?? d.discount}`, arr = seen.get(k) || [];
    const dup = arr.find((c) => Math.abs(new Date(c.pub_date || c.first_seen) - new Date(d.pub_date || d.first_seen)) <= 48 * 36e5);
    if (dup) { dup.dupes = [...new Set([...(dup.dupes || []), d.guid])]; continue; }
    arr.push(d); seen.set(k, arr); keptDeals.push(d);
  }
  deals = keptDeals.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen)).slice(0, CFG.max_deals);
  const out = { version: 2, generated_at: nowIso, label: 'Community reported (HotUKDeals RSS). Codes are community-posted and unverified.', bf_week: bf,
    stale_after_hours: bf ? 24 : 48, merchants: CFG.merchants, feeds: state, deals };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT + '.tmp', JSON.stringify(out) + '\n'); renameSync(OUT + '.tmp', OUT);
  if (logLines.length) { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, logLines.map((l) => JSON.stringify(l)).join('\n') + '\n'); }
  const dbRows = logLines.map(rowFromHukd).filter(Boolean);
  if (dbRows.length) { try { const saved = await persistRows(dbRows); if (!saved.skipped) console.log(`mysql: ${saved.observations} observations, ${saved.products} catalogue ids`); } catch (e) { warn('mysql: ' + (e && e.message ? e.message : e)); } }
  console.log(summary.join(' | ')); console.log(`deals ${deals.length}, logged ${logLines.length}${bf ? ' (Black Friday week cadence)' : ''}`);
  return { out, logLines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((e) => { console.error(e); process.exit(1); });
