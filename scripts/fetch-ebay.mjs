// Drop Club eBay price checker. Node 20+, no dependencies. Runs server-side in GitHub Actions only (.github/workflows/ebay-prices.yml):
// the OAuth client secret must never reach the browser.
//
// Uses ONLY eBay's official Buy > Browse API (item_summary/search) on the UK marketplace (X-EBAY-C-MARKETPLACE-ID: EBAY_GB),
// with an application token from the OAuth client-credentials grant (scope https://api.ebay.com/oauth/api_scope).
// No retailer or eBay web pages are fetched.
//
// For each item in the watch list (data/watchlist.json) it searches new-condition, Buy It Now (FIXED_PRICE) listings that
// deliver to the UK, keeps GBP listings whose titles match the item (must/any/exclude rules + a price floor), trims outliers
// (Tukey 1.5xIQR when there are 4+ listings) and records:
//   current_price = lowest remaining listing (item price; delivery in delivery_cost), canonical_url = that listing's eBay URL,
//   market_stats  = { lowest, median, mean, count, trimmed }  ("typical price on eBay" = median; never RRP).
// Records follow docs/price-contract.schema.json (pence, UTC, confidence, error_state ok/not_found/blocked/changed).
//
// Output (EBAY_OUT, default data/ebay.json): latest snapshot { version, generated_at, status, items:[record], meta }.
// Price log (EBAY_LOG, default <dir of EBAY_OUT>/price-log.jsonl): append-only; one contract record per item when its price,
// median or error_state changes, or at least once every 24h.
//
// Politeness: 1 token call + 1 search per item per run, EBAY_DELAY_MS (default 1500ms) between searches, hard cap
// EBAY_MAX_CALLS (default 60) per run. Free tier = 5,000 calls/day; 10 items every 30 min = ~530/day.
// On HTTP 429 we stop immediately: that item is 'blocked', later items keep their previous record (which shows its own time).
// Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET => prints "eBay keys not set yet – skipping" and exits 0 without writing.
// Env (tests): EBAY_API_BASE, EBAY_WATCHLIST, EBAY_OUT, EBAY_LOG, EBAY_NOW (ISO), EBAY_DELAY_MS, EBAY_TIMEOUT_MS, EBAY_MAX_CALLS.
import { writeFileSync, readFileSync, existsSync, renameSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
export const SCOPE = 'https://api.ebay.com/oauth/api_scope';
export const MARKETPLACE = 'EBAY_GB';
const UA = 'DropClub/0.4 (+https://github.com/nathanjaldridge-star/wishlist-drop)';
const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
const warn = (m) => console.log(`::warning::ebay prices: ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* eBay Partner Network (EPN) hook: DISABLED. EPN is a separate application (needs Nathan's OK). When approved, set enabled
   and campaignId; the search call should then send X-EBAY-C-ENDUSERCTX: affiliateCampaignId=<id> and use itemAffiliateWebUrl.
   Until then listing URLs are stored untouched (no affiliate params). */
export const EPN = { enabled: false, campaignId: '' };
export function listingUrl(it) {
  if (EPN.enabled && EPN.campaignId && it.itemAffiliateWebUrl) return it.itemAffiliateWebUrl;
  try { const u = new URL(it.itemWebUrl); u.search = ''; u.hash = ''; return u.toString(); } catch { return null; }
}

/** "123.45" / "10" / "0.5" -> integer pence, without float maths. Returns null for anything else. */
export function toPence(v) {
  const s = String(v ?? '').trim().replace(/,/g, '');
  const m = s.match(/^(\d+)(?:\.(\d{1,2})\d*)?$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const spaced = (s) => ' ' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const DEFAULT_EXCLUDE = ['for parts', 'faulty', 'spares', 'not working', 'empty box', 'box only', 'replica', 'compatible with', 'for apple', 'for sony', 'for nintendo', 'for dyson', 'for garmin', 'for kindle', 'for ninja', 'for ps5', 'for playstation', 'for lego', 'sticker', 'decal', 'skin'];
export function titleMatches(title, w) {
  const sq = squash(title), sp = spaced(title);
  if ((w.must || []).some((t) => !sq.includes(squash(t)))) return false;
  if ((w.any || []).length && !w.any.some((t) => sq.includes(squash(t)))) return false;
  if (DEFAULT_EXCLUDE.concat(w.exclude || []).some((x) => sp.includes(spaced(x)))) return false;
  return true;
}

export function median(sorted) { const n = sorted.length; if (!n) return null; return n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2); }
/** Trim outliers with Tukey fences (1.5 x IQR) when n >= 4. Input: listing objects with .price (pence). */
export function trimOutliers(list) {
  const s = [...list].sort((a, b) => a.price - b.price);
  if (s.length < 4) return { kept: s, trimmed: 0 };
  const q = (p) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo].price + (s[hi].price - s[lo].price) * (i - lo); };
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const kept = s.filter((x) => x.price >= lo && x.price <= hi);
  return { kept, trimmed: s.length - kept.length };
}
export function stats(list) {
  const { kept, trimmed } = trimOutliers(list);
  if (!kept.length) return null;
  const ps = kept.map((x) => x.price);
  return { lowest: ps[0], median: median(ps), mean: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length), count: ps.length, trimmed, basis: 'new, Buy It Now, GBP, item price excl. delivery' };
}

/** Parse a Browse item_summary/search response for one watch item. Pure. */
export function parseSearch(json, w, nowIso) {
  const base = { product_id: `ebay:watch:${w.id}`, canonical_url: `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(w.query)}`, retailer: 'eBay', title: w.title, current_price: null, currency: 'GBP', fetched_at: nowIso, in_stock: null, was_price: null, is_promo: false, promo_code: null, delivery_cost: null, price_history: [], source: 'ebay_browse', confidence: 0, watch_id: w.id, ...(w.catalogue_id ? { catalogue_id: w.catalogue_id } : {}) };
  if (!json || typeof json !== 'object' || (json.itemSummaries !== undefined && !Array.isArray(json.itemSummaries)) || (json.itemSummaries === undefined && typeof json.total !== 'number'))
    return { ...base, error_state: 'changed', error_detail: 'eBay response did not have the expected itemSummaries list.' };
  const rows = (json.itemSummaries || []).map((it) => {
    const price = it?.price?.currency === 'GBP' ? toPence(it.price.value) : null;
    const fixed = Array.isArray(it?.buyingOptions) && it.buyingOptions.includes('FIXED_PRICE');
    const isNew = it?.conditionId == null || String(it.conditionId) === '1000';
    const ship = (it?.shippingOptions || []).find((o) => o?.shippingCost?.currency === 'GBP');
    return { it, price, fixed, isNew, ship: ship ? toPence(ship.shippingCost.value) : null, url: it ? listingUrl(it) : null };
  }).filter((r) => r.price != null && r.price > 0 && r.fixed && r.isNew && r.url && titleMatches(r.it.title, w) && r.price >= (w.min_price_pence || 0));
  const st = stats(rows);
  if (!st) return { ...base, error_state: 'not_found', error_detail: json.total ? `eBay returned ${json.total} listings but none were a new, Buy It Now, GBP match for this item.` : 'No eBay listings found for this item.' };
  const best = trimOutliers(rows).kept[0], id = String(best.it.legacyItemId || String(best.it.itemId || '').split('|')[1] || best.it.itemId);
  return { ...base, product_id: `ebay:${id}`, canonical_url: best.url, title: String(best.it.title).slice(0, 200), current_price: best.price, delivery_cost: best.ship, in_stock: true,
    price_history: [{ date: nowIso, price: best.price }], confidence: Math.min(0.9, 0.5 + 0.1 * Math.min(st.count, 4)), error_state: 'ok', error_detail: null, market_stats: st };
}

async function call(url, opts, timeout) {
  try { return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) }); }
  catch (e) { return { ok: false, status: 0, error: e.name === 'TimeoutError' ? `timed out after ${timeout}ms` : e.message, json: async () => null, text: async () => '' }; }
}

export async function getToken(base, id, secret, timeout = 15000) {
  const res = await call(`${base}/identity/v1/oauth2/token`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }).toString() }, timeout);
  if (!res.ok) return { error: res.status ? `token request failed: HTTP ${res.status}` : `token request failed: ${res.error}`, status: res.status };
  const j = await res.json().catch(() => null);
  if (!j || typeof j.access_token !== 'string') return { error: 'token response had no access_token', status: res.status };
  return { token: j.access_token };
}

export function searchUrl(base, w) {
  const q = new URLSearchParams({ q: w.query, filter: 'buyingOptions:{FIXED_PRICE},conditionIds:{1000},deliveryCountry:GB', limit: '50' });
  if (w.category_id) q.set('category_ids', String(w.category_id));
  return `${base}/buy/browse/v1/item_summary/search?${q}`;
}

const sameObs = (a, b) => a && b && a.current_price === b.current_price && a.error_state === b.error_state && (a.market_stats?.median ?? null) === (b.market_stats?.median ?? null);

export async function run(o = {}) {
  const id = o.clientId ?? env.EBAY_CLIENT_ID, secret = o.clientSecret ?? env.EBAY_CLIENT_SECRET;
  if (!id || !secret) { console.log('eBay keys not set yet – skipping'); return { skipped: true }; }
  const BASE = (env.EBAY_API_BASE || 'https://api.ebay.com').replace(/\/$/, '');
  const OUT = env.EBAY_OUT || 'data/ebay.json', LOG = env.EBAY_LOG || join(dirname(OUT), 'price-log.jsonl');
  const WL = JSON.parse(readFileSync(env.EBAY_WATCHLIST || join(here, '..', 'data', 'watchlist.json'), 'utf8'));
  const NOW = env.EBAY_NOW ? new Date(env.EBAY_NOW) : new Date(), nowIso = iso(NOW);
  const DELAY = env.EBAY_DELAY_MS != null ? +env.EBAY_DELAY_MS : 1500, TIMEOUT = +env.EBAY_TIMEOUT_MS || 15000, MAX = +env.EBAY_MAX_CALLS || 60;
  let prev = { items: [], meta: {} };
  if (existsSync(OUT)) try { const j = JSON.parse(readFileSync(OUT, 'utf8')); prev = { items: Array.isArray(j.items) ? j.items : [], meta: j.meta || {} }; } catch { warn('previous ebay.json unreadable; starting fresh'); }
  const prevBy = new Map(prev.items.map((r) => [r.watch_id, r]));
  let calls = 0, status = 'ok', stop = null;
  const tok = await getToken(BASE, id, secret, TIMEOUT); calls++;
  if (tok.error) { warn(`${tok.error}; keeping previous prices`); status = tok.status === 429 ? 'rate_limited' : 'blocked'; stop = tok.status === 429 ? 'eBay rate limit (HTTP 429) on token request.' : `eBay did not issue a token (${tok.error}). Check the keys.`; }
  const items = [], meta = { ...prev.meta }, logLines = [];
  for (const [i, w] of WL.items.entries()) {
    const old = prevBy.get(w.id);
    if (stop || calls >= MAX) { if (old) items.push(old); else items.push({ ...parseSearch(null, w, nowIso), error_state: 'blocked', error_detail: stop || 'Per-run call cap reached; will check next run.', confidence: 0 }); continue; }
    if (i > 0 && DELAY) await sleep(DELAY);
    let res = await call(searchUrl(BASE, w), { headers: { Authorization: `Bearer ${tok.token}`, 'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE, Accept: 'application/json', 'User-Agent': UA } }, TIMEOUT); calls++;
    if (res.status >= 500 && calls < MAX) { await sleep(DELAY * 2); res = await call(searchUrl(BASE, w), { headers: { Authorization: `Bearer ${tok.token}`, 'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE, Accept: 'application/json', 'User-Agent': UA } }, TIMEOUT); calls++; }
    let rec;
    if (res.status === 429) { status = 'rate_limited'; stop = 'eBay rate limit (HTTP 429): stopped this run to stay within the daily quota.'; rec = { ...parseSearch(null, w, nowIso), error_state: 'blocked', error_detail: 'eBay rate limit (HTTP 429). We will try again next run.', confidence: 0 }; warn(`${w.id}: HTTP 429, stopping run`); }
    else if (res.status === 401 || res.status === 403) { status = 'blocked'; stop = `eBay refused the request (HTTP ${res.status}).`; rec = { ...parseSearch(null, w, nowIso), error_state: 'blocked', error_detail: `eBay refused the request (HTTP ${res.status}).`, confidence: 0 }; warn(`${w.id}: HTTP ${res.status}, stopping run`); }
    else if (!res.ok) { warn(`${w.id}: ${res.status ? 'HTTP ' + res.status : res.error}; keeping previous`); rec = old || { ...parseSearch(null, w, nowIso), error_state: 'blocked', error_detail: `eBay request failed (${res.status ? 'HTTP ' + res.status : res.error}).`, confidence: 0 }; }
    else rec = parseSearch(await res.json().catch(() => null), w, nowIso);
    if (rec !== old && rec.error_state === 'ok' && old?.error_state === 'ok' && old.price_history) {
      const h = old.price_history.filter((x) => NOW - new Date(x.date) <= 30 * 864e5);
      rec.price_history = h.length && h[h.length - 1].price === rec.current_price ? h : h.concat(rec.price_history).slice(-60);
    }
    items.push(rec);
    if (rec !== old) {
      const last = meta[w.id]?.last_logged;
      if (!sameObs(rec, old) || !last || NOW - new Date(last) >= 24 * 36e5) { logLines.push({ ...rec, price_history: rec.price_history.slice(-1) }); meta[w.id] = { last_logged: nowIso }; }
    }
  }
  const out = { version: 1, generated_at: nowIso, source: 'ebay_browse', marketplace: MARKETPLACE, status, calls,
    label: 'Live prices from the eBay Browse API (new, Buy It Now, GBP, UK delivery). Typical price = median of matching listings with outliers trimmed; it is not an RRP.',
    watchlist_count: WL.items.length, watchlist: WL.items.map((w) => ({ id: w.id, title: w.title, ...(w.catalogue_id ? { catalogue_id: w.catalogue_id } : {}) })), items, meta };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT + '.tmp', JSON.stringify(out) + '\n'); renameSync(OUT + '.tmp', OUT);
  if (logLines.length) { mkdirSync(dirname(LOG), { recursive: true }); appendFileSync(LOG, logLines.map((l) => JSON.stringify(l)).join('\n') + '\n'); }
  const n = (s) => items.filter((r) => r.error_state === s).length;
  console.log(`eBay: ${items.length} items (ok ${n('ok')}, not_found ${n('not_found')}, blocked ${n('blocked')}, changed ${n('changed')}), ${calls} API calls, logged ${logLines.length}, status ${status}`);
  return { out, logLines, calls };
}

if (import.meta.url === `file://${process.argv[1]}`) run().catch((e) => { console.error(e); process.exit(1); });
