// Drop Club catalogue id and product identifiers. Pure functions, no database.
//
// Catalogue id: "DC" + 9 random Crockford base32 characters + 1 Luhn mod 32 check character (12 characters).
// It is minted ONCE per product and stored. It is not a hash of a GTIN or watch-list id, because those change or arrive late
// (a barcode found next month must not give the product a new id and split its price history).
// Luhn mod 32 catches every single-character typo and every swap of neighbouring characters except 0 <-> Z (tested).

import { randomInt } from 'node:crypto';

export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const N = ALPHABET.length;
const SHAPE = /^DC[0-9A-HJKMNP-TV-Z]{10}$/;

export function checkChar(body) {
  if (typeof body !== 'string' || !body.length) return null;
  let factor = 2, sum = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    const code = ALPHABET.indexOf(body[i]);
    if (code < 0) return null;
    let addend = factor * code;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / N) + (addend % N);
    sum += addend;
  }
  return ALPHABET[(N - (sum % N)) % N];
}

export function mintCatalogueId(rand = randomInt) {
  let body = '';
  for (let i = 0; i < 9; i++) body += ALPHABET[rand(N)];
  return 'DC' + body + checkChar(body);
}

export function validCatalogueId(s) {
  return typeof s === 'string' && SHAPE.test(s) && checkChar(s.slice(2, 11)) === s[11];
}

/**
 * GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) -> 14-digit string, or null.
 * Only digits, with optional spaces or hyphens between them; anything else is not a barcode.
 * Rejects bad check digits, all zeros, and GS1 restricted ranges that are not unique across shops
 * (in-store / internal numbers 02, 04, 2x; coupons 05, 98x, 99x; variable-measure indicator 9; restricted EAN-8 0 and 2).
 */
export function parseGtin(raw) {
  const s = String(raw ?? '').trim();
  if (!/^[0-9][0-9 -]*[0-9]$/.test(s)) return null;
  const d = s.replace(/[ -]/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return null;
  if (d.length === 8 && /^[02]/.test(d)) return null;
  const g = d.padStart(14, '0');
  if (/^0+$/.test(g)) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g[12 - i]) * (i % 2 === 0 ? 3 : 1);
  if ((10 - (sum % 10)) % 10 !== Number(g[13])) return null;
  if (g[0] === '9') return null;
  const g13 = g.slice(1);
  if (d.length !== 8 && (/^0[245]/.test(g13) || /^2/.test(g13) || /^98[0-4]/.test(g13) || /^99/.test(g13))) return null;
  return g;
}

export const parseAsin = (raw) => { const s = String(raw ?? '').trim().toUpperCase(); return /^[A-Z0-9]{10}$/.test(s) && /[0-9]/.test(s) ? s : null; };
export const parseWatchId = (raw) => { const s = String(raw ?? '').trim(); return /^[a-z0-9][a-z0-9-]{0,79}$/.test(s) ? s : null; };
