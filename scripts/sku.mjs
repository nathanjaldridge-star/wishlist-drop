// Drop Club catalogue id.
//
// A retailer SKU identifies a stock line inside one shop. The same headphones are a different SKU at
// Amazon, Currys and eBay, so a retailer SKU cannot be the key we compare on. A GTIN (EAN-13, UPC,
// ISBN-13, GTIN-14) is the product equivalent of an ISIN: one barcode, every retailer.
//
// The id we issue is 12 characters, in the shape of an ISIN:
//   DC  +  9-character body  +  1 check character
// Alphabet is Crockford base32 (no I, L, O, U) so the id survives being read aloud or typed.
// The body is a SHA-256 of a namespaced key, so the same key always mints the same id.
//   gtin:<GTIN-14>   when a barcode checks out
//   watch:<id>       when the product is one we defined (data/watchlist.json)
// A title, description or fuzzy match never mints an id and never joins two listings.

import { createHash } from 'node:crypto';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SKU_RE = /^DC[0-9A-HJKMNP-TV-Z]{10}$/;

function chars(n) {
  let s = '';
  for (let i = 0; i < 9; i++) { s = ALPHABET[Number(n % 32n)] + s; n /= 32n; }
  return s;
}

export function checkChar(body) {
  if (typeof body !== 'string' || body.length !== 9) return null;
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const v = ALPHABET.indexOf(body[i]);
    if (v < 0) return null;
    sum += v * (i + 1);
  }
  return ALPHABET[sum % 32];
}

/** Deterministic catalogue id for a namespaced key. */
export function skuFromKey(key) {
  const digest = createHash('sha256').update(String(key)).digest();
  let n = 0n;
  for (const b of digest.subarray(0, 8)) n = (n << 8n) | BigInt(b);
  const body = chars(n);
  return 'DC' + body + checkChar(body);
}

export function validSku(s) {
  return typeof s === 'string' && SKU_RE.test(s) && s[11] === checkChar(s.slice(2, 11));
}

/**
 * GS1 check digit. Accepts GTIN-8, UPC-A (12), EAN-13 or GTIN-14.
 * Returns the 14-digit form, or null when the check digit fails.
 */
export function parseGtin(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return null;
  const g = d.padStart(14, '0');
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[12 - i]) * (i % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(g[13]) ? g : null;
}

/** First valid barcode in a string, as a whole digit run. Titles only; never a description blob. */
export function gtinInText(s) {
  const re = /(?<!\d)(\d{8}|\d{12,14})(?!\d)/g;
  let found = null, m;
  while ((m = re.exec(String(s || '')))) { const g = parseGtin(m[1]); if (g) found = g; }
  return found;
}

export function skuForGtin(raw) {
  const g = parseGtin(raw);
  return g ? skuFromKey('gtin:' + g) : null;
}

export function skuForWatch(watchId) {
  const id = String(watchId || '').trim();
  return id ? skuFromKey('watch:' + id) : null;
}

/**
 * Which catalogue id a price belongs to.
 * A barcode wins, because it is the same product in every shop.
 * Otherwise an item we defined (watch list) gets an issued id.
 * Anything else stays unidentified: we still store the listing, but we do not pretend it is a product.
 */
export function identify({ gtin, watchId } = {}) {
  const g = parseGtin(gtin);
  if (g) return { sku: skuFromKey('gtin:' + g), gtin: g, basis: 'gtin' };
  const id = String(watchId || '').trim();
  if (id) return { sku: skuFromKey('watch:' + id), gtin: null, basis: 'watch' };
  return { sku: null, gtin: null, basis: 'none' };
}
