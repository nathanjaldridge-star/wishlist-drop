// Writes price rows to MySQL. No-op when MYSQL_URL is unset, so the GitHub Pages fetchers keep working
// before a database exists. The browser never connects: only scripts/fetch-ebay.mjs and scripts/fetch-hukd.mjs do.
//
// MYSQL_URL=mysql://USER:PASSWORD@HOST:3306/dropclub
// Optional ?ssl=1 turns on TLS.
// node scripts/price-store.mjs --init   applies db/schema.sql

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gtinInText, identify, validSku } from './sku.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(here, '..', 'db', 'schema.sql');

export function poolOptions(url) {
  const u = new URL(url);
  if (u.protocol !== 'mysql:') throw new Error('MYSQL_URL must start with mysql://');
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!database) throw new Error('MYSQL_URL is missing a database name');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    ssl: u.searchParams.get('ssl') === '1' ? { rejectUnauthorized: true } : undefined,
    connectionLimit: 2,
    timezone: 'Z',
    charset: 'utf8mb4',
  };
}

export function toMysqlTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/** One fetcher log line -> a store row. Returns null when there is nothing to keep. */
export function rowFromEbay(rec) {
  if (!rec || !rec.watch_id || !rec.fetched_at) return null;
  return {
    source: 'ebay_browse',
    retailer: rec.retailer || 'eBay',
    externalId: 'watch:' + rec.watch_id,
    url: rec.canonical_url || 'https://www.ebay.co.uk/',
    watchId: rec.watch_id,
    gtin: null,
    title: rec.title || rec.watch_id,
    observedAt: rec.fetched_at,
    pricePence: rec.current_price,
    deliveryPence: rec.delivery_cost,
    currency: rec.currency || 'GBP',
    inStock: rec.in_stock,
    confidence: rec.confidence ?? 0,
    errorState: rec.error_state || 'ok',
    offerRef: rec.product_id || null,
    retailerSku: null,
  };
}

export function rowFromHukd(line) {
  if (!line || !(line.guid || line.id) || !line.observed_at) return null;
  return {
    source: 'hukd_rss',
    retailer: line.merchant || 'Unknown',
    externalId: String(line.guid || line.id),
    url: line.link || 'https://www.hotukdeals.com/',
    watchId: null,
    gtin: gtinInText(line.title),
    title: line.title || '',
    observedAt: line.observed_at,
    pricePence: line.price,
    deliveryPence: null,
    currency: line.currency || 'GBP',
    inStock: null,
    confidence: line.price == null ? 0 : 0.5,
    errorState: line.price == null ? 'not_found' : 'ok',
    offerRef: line.guid ? String(line.guid) : null,
    retailerSku: null,
  };
}

/**
 * Prior prices for one catalogue id. The low is MIN(price_pence) in [asOf - days, asOf).
 * The id is the only predicate. A title is never part of this query.
 */
export function baselineQuery(sku, asOf, days = 30) {
  if (!validSku(sku)) throw new Error('baselineQuery needs a catalogue sku');
  const end = new Date(asOf);
  if (Number.isNaN(end.getTime())) throw new Error('baselineQuery needs a time');
  const start = new Date(end.getTime() - days * 864e5);
  return {
    sql: `SELECT MIN(price_pence) AS low_pence, COUNT(*) AS n
FROM price_observations
WHERE sku = ? AND error_state = 'ok' AND price_pence > 0
  AND observed_at >= ? AND observed_at < ?`,
    params: [sku, toMysqlTime(start), toMysqlTime(end)],
  };
}

/** Insert products, listings and observations. `query(sql, params)` returns a driver result with insertId. */
export async function writePrices(query, rows) {
  let products = 0, listings = 0, observations = 0, unidentified = 0;
  for (const row of rows) {
    if (!row || !row.source || !row.externalId || !toMysqlTime(row.observedAt)) continue;
    const idn = identify(row);
    if (!idn.sku) unidentified++;
    else {
      await query(
        `INSERT INTO products (sku, gtin, title) VALUES (?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE gtin = COALESCE(products.gtin, new.gtin), title = new.title`,
        [idn.sku, idn.gtin, String(row.title || '').slice(0, 200)],
      );
      products++;
    }
    const listing = await query(
      `INSERT INTO listings (sku, source, retailer, retailer_sku, external_id, url, title)
       VALUES (?, ?, ?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE
         id = LAST_INSERT_ID(id),
         sku = COALESCE(listings.sku, new.sku),
         retailer = new.retailer,
         retailer_sku = COALESCE(new.retailer_sku, listings.retailer_sku),
         url = new.url,
         title = new.title`,
      [
        idn.sku, String(row.source).slice(0, 32), String(row.retailer || 'Unknown').slice(0, 80),
        row.retailerSku || null, String(row.externalId).slice(0, 80), String(row.url || '').slice(0, 500),
        String(row.title || '').slice(0, 200),
      ],
    );
    if (!listing || !listing.insertId) throw new Error('listing insert did not return an id');
    listings++;
    await query(
      `INSERT INTO price_observations
        (sku, listing_id, observed_at, price_pence, delivery_pence, currency, in_stock, confidence, error_state, offer_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE price_pence = new.price_pence, delivery_pence = new.delivery_pence,
         error_state = new.error_state, confidence = new.confidence`,
      [
        idn.sku, listing.insertId, toMysqlTime(row.observedAt),
        row.pricePence == null ? null : row.pricePence, row.deliveryPence == null ? null : row.deliveryPence,
        row.currency || 'GBP', row.inStock == null ? null : row.inStock ? 1 : 0,
        row.confidence ?? 0, row.errorState || 'ok', row.offerRef ? String(row.offerRef).slice(0, 80) : null,
      ],
    );
    observations++;
  }
  return { products, listings, observations, unidentified };
}

export async function persistRows(rows, env = process.env) {
  if (!env.MYSQL_URL) return { skipped: true };
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ ...poolOptions(env.MYSQL_URL), multipleStatements: false });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await writePrices((sql, params) => conn.query(sql, params).then(([result]) => result), rows);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch { /* already failed */ }
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
}

export async function applySchema(env = process.env) {
  if (!env.MYSQL_URL) throw new Error('MYSQL_URL is not set');
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ ...poolOptions(env.MYSQL_URL), multipleStatements: true });
  try {
    await pool.query(readFileSync(SCHEMA, 'utf8'));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === '--init') {
    applySchema().then(() => { console.log('schema applied'); }).catch((e) => { console.error(e.message); process.exit(1); });
  }
}
