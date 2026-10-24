// Loads price-log.jsonl lines (written by scripts/fetch-ebay.mjs and scripts/fetch-hukd.mjs on the data branch) into Postgres.
// The JSONL log stays the source of truth: the database can be rebuilt from it at any time, and re-running is a no-op.
// The fetchers do not import this file and never see DATABASE_URL.
// CLI: DATABASE_URL=... node scripts/db/ingest.mjs mirror/price-log.jsonl [data/watchlist.json]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect, isMain } from './client.mjs';
import { mintCatalogueId, parseAsin, parseGtin, parseWatchId, validCatalogueId } from './catalogue-id.mjs';

const MARKET_BY_CURRENCY = { GBP: 'GB', USD: 'US' };
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const minor = (v) => (v == null ? null : Number.isInteger(v) && v >= 0 ? v : NaN);

const ENTITIES = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
const decode = (t) => String(t || '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);
// Storefronts outside the UK and US (HotUKDeals lists "Amazon Germany", "Amazon France" ...). We serve UK and US only.
const FOREIGN = /\b(germany|deutschland|france|spain|espana|italy|italia|netherlands|nederland|belgium|poland|sweden|ireland|japan|canada|australia|china|india|mexico)\b|\.(de|fr|es|it|nl|be|pl|se|ie|jp|ca|com\.au|cn|in|com\.mx)\b/i;
// Names shops go by in feeds -> our retailer slug (before the -uk / -us suffix).
const ALIASES = { 'john-lewis-and-partners': 'john-lewis', 'john-lewis-partners': 'john-lewis', 'currys-pc-world': 'currys', 'ao-com': 'ao', 'amazon-co-uk': 'amazon', 'ebay-co-uk': 'ebay' };

/** Shop name + market -> retailer id, or null for a store outside the UK and US. */
export function retailerId(name, market) {
  const n = decode(name);
  if (FOREIGN.test(n)) return null;
  let slug = n.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44) || 'unknown';
  slug = ALIASES[slug] || slug.replace(/-(uk|us|com)$/, '');
  slug = ALIASES[slug] || slug;
  return `${slug}-${market === 'US' ? 'us' : 'uk'}`;
}

/** One log line -> a normalised row, or {reject: reason}. Pure: no database, no clock. */
export function mapLine(line) {
  if (!line || typeof line !== 'object') return { reject: 'not an object' };
  const source = line.source;
  const at = line.fetched_at ?? line.observed_at;
  if (typeof at !== 'string' || !ISO_WITH_ZONE.test(at) || Number.isNaN(Date.parse(at))) return { reject: 'timestamp missing or has no time zone' };
  const currency = line.currency || 'GBP';
  const market = MARKET_BY_CURRENCY[currency];
  if (!market) return { reject: `currency ${currency} is not a market we serve` };
  const price = minor(source === 'hukd_rss' ? line.price : line.current_price);
  const delivery = minor(line.delivery_cost), was = minor(line.was_price);
  if ([price, delivery, was].some(Number.isNaN)) return { reject: 'money must be whole minor units (pence/cents)' };
  const base = { source, market, currency, observedAt: new Date(at).toISOString(), priceMinor: price, deliveryMinor: delivery, wasMinor: was };

  if (source === 'ebay_browse') {
    const watchId = parseWatchId(line.watch_id);
    const offer = typeof line.product_id === 'string' && /^ebay:\d+$/.test(line.product_id) ? line.product_id : null;
    const errorState = line.error_state || 'ok';
    const st = line.market_stats;
    return { ...base, retailer: market === 'US' ? 'ebay-us' : 'ebay-uk', retailerName: market === 'US' ? 'eBay US' : 'eBay UK',
      externalId: watchId ? `watch:${watchId}` : offer || line.product_id, kind: watchId ? 'search_aggregate' : 'offer',
      url: line.canonical_url, title: line.title, watchId, catalogueId: validCatalogueId(line.catalogue_id) ? line.catalogue_id : null, gtin: parseGtin(line.gtin), asin: null,
      priceMinor: errorState === 'ok' ? price : null, typicalMinor: st && Number.isInteger(st.median) && st.median > 0 ? st.median : null,
      sampleCount: st && Number.isInteger(st.count) && st.count > 0 ? st.count : null, inStock: line.in_stock ?? null,
      confidence: Number(line.confidence) || 0, errorState, offerRef: offer };
  }
  if (source === 'hukd_rss') {
    // A deal post is not a product. Never identified from its title; stored only if HUKD gives permission (sources.enabled).
    return { ...base, retailer: retailerId(line.merchant, market), retailerName: decode(line.merchant) || 'Unknown', externalId: String(line.guid || line.id || ''),
      kind: 'deal_post', url: line.link, title: decode(line.title), watchId: null, catalogueId: null, gtin: null, asin: null, typicalMinor: null, sampleCount: null,
      inStock: null, confidence: price == null ? 0 : 0.5, errorState: price == null ? 'not_found' : 'ok', offerRef: null };
  }
  // Any other price-contract record (awin_feed, user_capture, manual, ...).
  const errorState = line.error_state || 'ok';
  return { ...base, retailer: retailerId(line.retailer, market), retailerName: decode(line.retailer) || 'Unknown', externalId: String(line.product_id || ''),
    kind: 'offer', url: line.canonical_url, title: line.title, watchId: parseWatchId(line.watch_id), catalogueId: validCatalogueId(line.catalogue_id) ? line.catalogue_id : null, gtin: parseGtin(line.gtin),
    asin: parseAsin(line.asin), priceMinor: errorState === 'ok' ? price : null, typicalMinor: null, sampleCount: null,
    inStock: line.in_stock ?? null, confidence: Number(line.confidence) || 0, errorState, offerRef: null };
}

export const ingestKey = (r) => createHash('sha256').update([r.source, r.market, r.externalId, r.observedAt].join('|')).digest('hex');

function check(r) {
  if (!r.retailer) return 'shop is outside the UK and US';
  if (!r.externalId) return 'no external id';
  if (typeof r.url !== 'string' || !/^https:\/\//.test(r.url)) return 'url must be https';
  if (!['ok', 'not_found', 'blocked', 'changed'].includes(r.errorState)) return 'unknown error_state';
  if (r.errorState === 'ok' && !(r.priceMinor > 0)) return 'ok record without a price';
  if (!(r.confidence >= 0 && r.confidence <= 1)) return 'confidence out of range';
  return null;
}

async function findProduct(tx, r) {
  if (r.catalogueId) {
    const hit = await tx.query('select coalesce(merged_into, id) as id from products where catalogue_id = $1', [r.catalogueId]);
    if (hit.rows.length) return { id: hit.rows[0].id, keys: identifierKeys(r) };
  }
  const keys = identifierKeys(r);
  for (const [scheme, scope, value] of keys) {
    const hit = await tx.query(`select coalesce(p.merged_into, p.id) as id from product_identifiers i join products p on p.id = i.product_id
      where i.scheme = $1 and i.scope = $2 and i.value = $3`, [scheme, scope, value]);
    if (hit.rows.length) return { id: hit.rows[0].id, keys };
  }
  return { id: null, keys };
}

function identifierKeys(r) {
  const keys = [];
  if (r.gtin) keys.push(['gtin', '', r.gtin]);
  if (r.asin) keys.push(['asin', r.market, r.asin]);
  if (r.watchId) keys.push(['watch', '', r.watchId]);
  return keys;
}

/** A product exists only for things we defined (watch list, issued catalogue id) or that carry a real barcode. Never from a title alone. */
async function ensureProduct(tx, r, watch) {
  const w = r.watchId ? watch.get(r.watchId) : null;
  const gtin = r.gtin || (w && parseGtin(w.gtin));
  const issued = (w && validCatalogueId(w.catalogue_id) && w.catalogue_id) || r.catalogueId;
  if (w && r.catalogueId && w.catalogue_id && r.catalogueId !== w.catalogue_id) throw new Error(`watch item ${r.watchId}: record says ${r.catalogueId}, watch list says ${w.catalogue_id}`);
  const found = await findProduct(tx, { ...r, gtin, catalogueId: issued });
  let id = found.id;
  if (id && issued) {
    const cur = (await tx.query('select catalogue_id from products where id = $1', [id])).rows[0].catalogue_id;
    if (cur !== issued) throw new Error(`catalogue id clash: ${issued} is already stored as ${cur}; merge them with merge_products()`);
  }
  if (!id) {
    if (!gtin && !w && !issued) return null;
    const title = String((w && w.title) || r.title || 'Untitled').slice(0, 300);
    for (let tries = 0; !id && tries < 5; tries++) {
      const ins = await tx.query(`insert into products (catalogue_id, title) values ($1, $2) on conflict (catalogue_id) do nothing returning id`, [issued || mintCatalogueId(), title]);
      id = ins.rows[0]?.id ?? null;
      if (!id && issued) throw new Error(`catalogue id ${issued} exists but was not found`);
    }
    if (!id) throw new Error('could not mint a unique catalogue id');
  }
  for (const [scheme, scope, value] of found.keys) {
    await tx.query(`insert into product_identifiers (product_id, scheme, scope, value, added_by) values ($1, $2, $3, $4, $5)
      on conflict (scheme, scope, value) do nothing`, [id, scheme, scope, value, r.source]);
  }
  return id;
}

/**
 * Ingest log lines. Returns counts; bad lines are reported, not silently dropped. A database error throws (the job fails loudly).
 * opts.watchlist: parsed data/watchlist.json, so watch-list items get their title (and gtin, if one is added) on first sight.
 */
export async function ingest(db, lines, opts = {}) {
  const watch = new Map(((opts.watchlist && opts.watchlist.items) || []).map((w) => [w.id, w]));
  const out = { inserted: 0, duplicate: 0, expired: 0, skippedSource: {}, rejected: [] };
  const now = opts.now ? new Date(opts.now) : new Date();
  const sources = new Map((await db.query('select id, enabled, extract(epoch from retain_for)::float8 as retain_s from sources')).rows.map((s) => [s.id, s]));
  await db.transaction(async (tx) => {
    for (const [i, line] of lines.entries()) {
      const r = mapLine(line);
      if (r.reject) { out.rejected.push({ line: i + 1, reason: r.reject }); continue; }
      const src = sources.get(r.source);
      if (!src) { out.rejected.push({ line: i + 1, reason: `unknown source ${r.source}` }); continue; }
      if (!src.enabled) { out.skippedSource[r.source] = (out.skippedSource[r.source] || 0) + 1; continue; }
      if (src.retain_s != null && Date.parse(r.observedAt) < now.getTime() - src.retain_s * 1000) { out.expired = (out.expired || 0) + 1; continue; }
      const bad = check(r);
      if (bad) { out.rejected.push({ line: i + 1, reason: bad }); continue; }
      await tx.query(`insert into retailers (id, market, name, price_alerts_enabled) values ($1, $2, $3, $4) on conflict (id) do nothing`,
        [r.retailer, r.market, String(r.retailerName).slice(0, 80), !/^amazon-/.test(r.retailer)]);
      const productId = await ensureProduct(tx, r, watch);
      const listing = await tx.query(`insert into listings (product_id, source, retailer_id, market, external_id, kind, url, title)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (source, market, external_id) do update
          set product_id = coalesce(listings.product_id, excluded.product_id), url = excluded.url, title = excluded.title
        returning id`, [productId, r.source, r.retailer, r.market, r.externalId.slice(0, 200), r.kind, r.url, String(r.title || '').slice(0, 300)]);
      const ins = await tx.query(`insert into price_observations (listing_id, observed_at, currency, price_minor, delivery_minor, was_minor,
          typical_minor, sample_count, in_stock, confidence, error_state, offer_ref, ingest_key)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict (ingest_key) do nothing returning id`,
        [listing.rows[0].id, r.observedAt, r.currency, r.priceMinor, r.deliveryMinor, r.wasMinor, r.typicalMinor, r.sampleCount,
          r.inStock, Math.round(r.confidence * 100) / 100, r.errorState, r.offerRef, ingestKey(r)]);
      if (ins.rows.length) out.inserted++; else out.duplicate++;
    }
    const pruned = await tx.query('select prune_observations($1) as n', [now.toISOString()]);
    out.pruned = Number(pruned.rows[0].n);
  });
  return out;
}

export function readJsonl(path) {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
}

if (isMain(import.meta)) {
  const [logPath, wlPath] = process.argv.slice(2);
  if (!logPath) { console.error('usage: node scripts/db/ingest.mjs <price-log.jsonl> [watchlist.json]'); process.exit(2); }
  const db = await connect();
  try {
    const res = await ingest(db, readJsonl(logPath), { watchlist: wlPath ? JSON.parse(readFileSync(wlPath, 'utf8')) : null });
    console.log(`ingest: ${res.inserted} new, ${res.duplicate} already stored, ${res.pruned} pruned, skipped ${JSON.stringify(res.skippedSource)}, rejected ${res.rejected.length}`);
    for (const r of res.rejected.slice(0, 20)) console.log(`  line ${r.line}: ${r.reason}`);
  } catch (e) { console.error('ingest failed: ' + e.message); process.exitCode = 1; } finally { await db.close(); }
}
