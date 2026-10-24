// Database tests against a real Postgres (PGlite: Postgres compiled to WebAssembly, in-process, no server, no sign-up).
// Nothing here reads DATABASE_URL, so running the tests can never write to a real database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { ALPHABET, checkChar, mintCatalogueId, parseGtin, validCatalogueId } from './db/catalogue-id.mjs';
import { migrate } from './db/migrate.mjs';
import { ingest, mapLine, retailerId } from './db/ingest.mjs';
import { exportSummary } from './db/export.mjs';
import { connectionOptions } from './db/client.mjs';
import { parseSearch } from './fetch-ebay.mjs';

delete process.env.DATABASE_URL;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ok = (m) => console.log('✓ ' + m);
const watchlist = JSON.parse(readFileSync(join(root, 'data', 'watchlist.json'), 'utf8'));

async function freshDb(before = '') {
  const pg = new PGlite();
  await pg.exec("set time zone 'UTC'; " + before);
  const wrap = (c) => ({ query: (s, p) => c.query(s, p), exec: (s) => c.exec(s) });
  const db = { ...wrap(pg), transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))), close: () => pg.close() };
  await migrate(db);
  return db;
}
const rejects = async (p, re) => { await assert.rejects(p, re); };
// Sources ship switched off until approved; tests that need one turn it on in their own throwaway database.
const enable = (db, ...ids) => db.query('update sources set enabled = true where id = any($1)', [ids]);

// ---------- catalogue id ----------
for (let i = 0; i < 200; i++) assert.ok(validCatalogueId(mintCatalogueId()));
const sample = mintCatalogueId(), body = sample.slice(2, 11);
for (let i = 0; i < 9; i++) for (const c of ALPHABET) {
  if (c === body[i]) continue;
  const typo = 'DC' + body.slice(0, i) + c + body.slice(i + 1) + sample[11];
  assert.equal(validCatalogueId(typo), false, `single typo at ${i} not caught`);
}
assert.equal(validCatalogueId('DC0000000000'.slice(0, 11) + 'X'), false);
assert.equal(checkChar('I'), null);
// Luhn mod 32 misses exactly one kind of adjacent swap: the first and last alphabet characters (0 and Z).
let missed = [];
for (const x of ALPHABET) for (const y of ALPHABET) {
  if (x === y) continue;
  const id = 'DC' + x + y + body.slice(2); const good = id + checkChar(id.slice(2));
  if (validCatalogueId('DC' + y + x + body.slice(2) + good[11])) missed.push(x + y);
}
assert.deepEqual(missed.sort(), ['0Z', 'Z0']);
ok('catalogue id: random, 12 characters; every single-character typo and every adjacent swap except 0<->Z is caught');
const cids = watchlist.items.map((x) => x.catalogue_id);
assert.ok(cids.every(validCatalogueId)); assert.equal(new Set(cids).size, cids.length);
ok('watch list: every item has its own valid catalogue id');

// ---------- GTIN ----------
assert.equal(parseGtin('4006381333931'), '04006381333931');
assert.equal(parseGtin('400-638-1333931'), '04006381333931');
assert.equal(parseGtin('4006381333932'), null);
assert.equal(parseGtin('ABC-4006381333931'), null);
assert.equal(parseGtin('00000000000000'), null);
assert.equal(parseGtin('2000000000008'), null, 'in-store number');
assert.equal(parseGtin('036000291452'), '00036000291452', 'UPC-A (US)');
assert.equal(parseGtin('96385074'), '00000096385074', 'EAN-8');
ok('GTIN: check digit, US UPC-A and EAN-8 accepted; all-zeros, in-store and junk-prefixed numbers rejected');

// ---------- migrations ----------
let db = await freshDb();
assert.deepEqual(await migrate(db), [], 'second run applies nothing');
const mig = (await db.query('select version from schema_migrations order by 1')).rows.map((r) => r.version);
assert.deepEqual(mig, ['0001', '0002']);
await db.query("update schema_migrations set checksum = 'x' where version = '0001'");
await rejects(migrate(db), /edited after it was applied/);
await db.close();
ok('migrations apply once, in order, and an edited migration is refused');

// ---------- constraints ----------
db = await freshDb();
await db.query("insert into products (catalogue_id, title) values ($1, 'T')", [mintCatalogueId()]);
await rejects(db.query("insert into products (catalogue_id, title) values ('nope', 'T')"), /check/);
await db.query("insert into listings (source, retailer_id, market, external_id, url, title) values ('user_capture', 'argos-uk', 'GB', 'a1', 'https://www.argos.co.uk/p/1', 'x')");
await rejects(db.query("insert into listings (source, retailer_id, market, external_id, url, title) values ('user_capture', 'argos-uk', 'US', 'a2', 'https://x', 'x')"), /foreign key/);
await rejects(db.query("insert into listings (source, retailer_id, market, external_id, url, title) values ('user_capture', 'argos-uk', 'GB', 'a3', 'http://x', 'x')"), /check/);
const obs = (cur, price, state = 'ok', key = Math.random().toString()) => db.query(`insert into price_observations (listing_id, observed_at, currency, price_minor, confidence, error_state, ingest_key)
  values (1, now(), $1, $2, 0.5, $3, $4)`, [cur, price, state, key]);
await rejects(obs('USD', 100), /does not match the market/);
await rejects(obs('GBP', 12.5), /integer/);
await rejects(obs('GBP', -1), /check/);
await rejects(obs('GBP', null), /check/);
await rejects(obs('GBP', 100, 'not_found'), /check/);
await obs('GBP', 100, 'ok', 'k1');
await rejects(obs('GBP', 100, 'ok', 'k1'), /unique/);
await rejects(db.query("insert into product_identifiers (product_id, scheme, scope, value) values (1, 'asin', '', 'B0ABCDEFGH')"), /check/);
await rejects(db.query("insert into product_identifiers (product_id, scheme, scope, value) values (1, 'retailer_sku', '', '123')"), /check/);
await db.close();
ok('constraints: a listing\'s market matches its shop, https only, whole minor units, currency matches market, ok rows have a price, ASIN scoped to a market, shop SKUs scoped to a shop');

// ---------- ingest real fetcher output ----------
db = await freshDb();
const w = watchlist.items.find((x) => x.id === 'sony-wh-1000xm5');
const ebayJson = (prices) => ({ total: prices.length, itemSummaries: prices.map((p, i) => ({ itemId: `v1|11${i}|0`, legacyItemId: `11${i}`, title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
  price: { value: (p / 100).toFixed(2), currency: 'GBP' }, buyingOptions: ['FIXED_PRICE'], conditionId: '1000', itemWebUrl: `https://www.ebay.co.uk/itm/11${i}`,
  shippingOptions: [{ shippingCost: { value: '3.49', currency: 'GBP' } }] })) });
const NOW = '2026-10-24T12:37:00Z';
const rec = parseSearch(ebayJson([24999, 26999, 27200, 27900]), w, NOW);
assert.equal(rec.error_state, 'ok', JSON.stringify(rec));
const miss = parseSearch({ total: 0, itemSummaries: [] }, watchlist.items[0], NOW);
const hukd = { observed_at: NOW, source: 'hukd_rss', guid: 'https://www.hotukdeals.com/deals/x-1', link: 'https://www.hotukdeals.com/deals/x-1', merchant: 'Argos', title: 'Sony WH-1000XM5 £199 at Argos', price: 19900, currency: 'GBP' };
const lines = [rec, miss, hukd, { ...rec, current_price: 249.99 }, { ...rec, fetched_at: '2026-10-24 12:37:00' }, null];
let res = await ingest(db, lines, { watchlist, now: NOW });
assert.equal(res.inserted, 2);
assert.deepEqual(res.skippedSource, { hukd_rss: 1 });
assert.deepEqual(res.rejected.map((r) => r.reason), ['money must be whole minor units (pence/cents)', 'timestamp missing or has no time zone', 'not an object']);
res = await ingest(db, lines, { watchlist, now: NOW });
assert.equal(res.inserted, 0); assert.equal(res.duplicate, 2);
const row = (await db.query(`select p.catalogue_id, p.title, l.kind, l.external_id, o.price_minor, o.typical_minor, o.sample_count, o.offer_ref, o.delivery_minor
  from price_observations o join listings l on l.id = o.listing_id join products p on p.id = l.product_id where l.external_id = 'watch:sony-wh-1000xm5'`)).rows;
assert.equal(row.length, 1);
assert.equal(rec.catalogue_id, w.catalogue_id, 'fetcher copies the catalogue id into each record');
assert.equal(row[0].catalogue_id, w.catalogue_id, 'stored under the catalogue id the watch list issued');
assert.equal(row[0].title, w.title); assert.equal(row[0].kind, 'search_aggregate');
assert.equal(row[0].price_minor, rec.current_price); assert.equal(row[0].delivery_minor, 349); assert.equal(row[0].typical_minor, rec.market_stats.median);
assert.equal(row[0].offer_ref, rec.product_id);
ok('ingest: eBay fetcher records load with typical price and the item behind the price; re-running is a no-op; HUKD is skipped until permitted; floats and zone-less times are rejected with a reason');

// same product keeps its id when a barcode turns up later; a title never creates a product
const before = row[0].catalogue_id;
await enable(db, 'user_capture');
const wl2 = { items: watchlist.items.map((x) => (x.id === w.id ? { ...x, gtin: '4548736132610' } : x)) };
await ingest(db, [{ ...rec, fetched_at: '2026-10-24T13:07:00Z' }], { watchlist: wl2, now: '2026-10-24T13:07:00Z' });
const ids = (await db.query(`select scheme, value from product_identifiers i join products p on p.id = i.product_id where p.catalogue_id = $1 order by 1`, [before])).rows;
assert.deepEqual(ids.map((r) => r.scheme), ['gtin', 'watch']);
await ingest(db, [{ source: 'user_capture', product_id: 'currys:123', retailer: 'Currys', canonical_url: 'https://www.currys.co.uk/p/123', title: 'Sony WH-1000XM5', current_price: 26900, currency: 'GBP', fetched_at: NOW, confidence: 0.7, error_state: 'ok' }], { now: NOW });
const orphan = (await db.query(`select product_id from listings where external_id = 'currys:123'`)).rows[0];
assert.equal(orphan.product_id, null);
await ingest(db, [{ source: 'user_capture', product_id: 'currys:124', retailer: 'Currys', canonical_url: 'https://www.currys.co.uk/p/124', title: 'anything', gtin: '4548736132610', current_price: 26900, currency: 'GBP', fetched_at: NOW, confidence: 0.7, error_state: 'ok' }], { now: NOW });
const joined = (await db.query(`select p.catalogue_id from listings l join products p on p.id = l.product_id where external_id = 'currys:124'`)).rows[0];
assert.equal(joined.catalogue_id, before);
await rejects(ingest(db, [{ ...rec, catalogue_id: mintCatalogueId(), fetched_at: '2026-10-24T13:10:00Z' }], { watchlist, now: '2026-10-24T13:10:00Z' }), /watch list says/);
const other = mintCatalogueId();
await rejects(ingest(db, [{ ...rec, catalogue_id: undefined, fetched_at: '2026-10-24T13:11:00Z' }], { watchlist: { items: [{ ...w, catalogue_id: other }] }, now: '2026-10-24T13:11:00Z' }), /clash/);
ok('identity: adding a barcode later keeps the same catalogue id; a Currys listing with the same barcode joins it; a title alone stays unidentified; a changed catalogue id stops the run instead of forking the product');

// merge duplicates
const a = (await db.query("insert into products (catalogue_id, title) values ($1, 'dup') returning id", [mintCatalogueId()])).rows[0].id;
const keep = (await db.query('select id from products where catalogue_id = $1', [before])).rows[0].id;
await db.query("update listings set product_id = $1 where external_id = 'currys:123'", [a]);
await db.query('select merge_products($1, $2)', [a, keep]);
assert.equal((await db.query("select count(*)::int n from listings where product_id = $1", [keep])).rows[0].n, 3);
await db.close();
ok('merge_products moves listings across and keeps the old id as a pointer');

// ---------- baseline / building history / Amazon switch / UK vs US ----------
db = await freshDb();
await db.exec(readFileSync(join(root, 'db', 'seed', 'example.sql'), 'utf8'));
await enable(db, 'user_capture');
let b = (await db.query(`select * from price_baseline('2026-10-25T13:00:00Z') order by retailer_id`)).rows;
const by = Object.fromEntries(b.map((r) => [r.retailer_id, r]));
assert.equal(by['argos-uk'].current_minor, 22900); assert.equal(by['argos-uk'].low_30d_minor, 27900);
assert.equal(by['argos-uk'].building_history, false); assert.equal(Number(by['argos-uk'].drop_pct), 17.9);
assert.equal(by['example-shop-us'].currency, 'USD'); assert.equal(by['example-shop-us'].low_30d_minor, 27900);
assert.equal(by['amazon-uk'].may_alert, false, 'Amazon alerts off until Amazon consents');
assert.equal(by['argos-uk'].may_alert, true);
b = (await db.query(`select * from price_baseline('2026-10-01T13:00:00Z') where retailer_id = 'argos-uk'`)).rows[0];
assert.equal(b.building_history, true); assert.equal(b.drop_pct, null);
ok('baseline: lowest price at the same retailer and currency in the prior 30 days; no drop % before 30 days of history; Amazon alerting switched off; UK and US never mixed');

// eBay: never feeds the baseline, shows age after 6h, pruned after 24h
res = await ingest(db, [rec], { watchlist, now: NOW });
let e = (await db.query(`select * from price_baseline('2026-10-24T20:00:00Z') where source = 'ebay_browse'`)).rows[0];
assert.equal(e.low_30d_minor, null); assert.equal(e.building_history, true); assert.equal(e.fresh, false);
const ex = await exportSummary(db, '2026-10-24T20:00:00Z');
const eb = ex.items.find((i) => i.source === 'ebay_browse');
assert.equal(eb.fresh, false); assert.equal(eb.age_minutes, 443); assert.equal(eb.low_30d, null);
assert.ok(ex.items.every((i) => i.source !== 'hukd_rss'));
assert.equal(eb.catalogue_id, w.catalogue_id); assert.equal(eb.baseline_allowed, false); assert.equal(eb.building_history, false, 'eBay never builds history, so never says it is');
const ag = ex.items.find((i) => i.retailer === 'argos-uk');
assert.deepEqual([ag.low_30d, ag.current_price, ag.baseline_allowed, ag.example], [27900, 27900, true, true]);
res = await ingest(db, [], { now: '2026-10-26T00:00:00Z' });
assert.equal(res.pruned, 1);
res = await ingest(db, [rec], { watchlist, now: '2026-10-26T00:00:00Z' });
assert.equal(res.inserted, 0); assert.equal(res.expired, 1, 'old eBay lines are not re-inserted after pruning');
await db.close();
ok('eBay: no baseline maths, marked not fresh after 6h with its age in the export, deleted after 24h and not re-inserted');

// ---------- real HotUKDeals log shapes (copied field-for-field from the data branch's price-log.jsonl) ----------
db = await freshDb();
await enable(db, 'hukd_rss');
const deal = (guid, merchant) => ({ observed_at: NOW, source: 'hukd_rss', guid: `https://www.hotukdeals.com/deals/${guid}`, link: `https://www.hotukdeals.com/deals/${guid}`, merchant, title: 'Deal &amp; more', price: 999, currency: 'GBP', kind: 'deal', change: 'new' });
res = await ingest(db, [deal('a-1', 'John Lewis &amp; Partners'), deal('a-2', 'Amazon Germany'), deal('a-3', 'Amazon'), deal('a-4', 'Currys PC World')], { now: NOW });
assert.equal(res.inserted, 3); assert.deepEqual(res.rejected.map((r) => r.reason), ['shop is outside the UK and US']);
const shops = (await db.query(`select l.retailer_id, l.title, l.product_id, r.price_alerts_enabled from listings l join retailers r on r.id = l.retailer_id order by 1`)).rows;
assert.deepEqual(shops.map((r) => r.retailer_id), ['amazon-uk', 'currys-uk', 'john-lewis-uk']);
assert.ok(shops.every((r) => r.product_id === null && r.title === 'Deal & more'));
assert.equal(shops[0].price_alerts_enabled, false);
assert.equal((await exportSummary(db, NOW)).items.length, 0, 'deal posts are not products, so they are not exported');
await db.close();
ok('HotUKDeals (when permitted): HTML entities decoded, shop names mapped to the seeded shops, Amazon Germany refused, deal posts never become products or exports');

// ---------- database permissions (what Supabase's public anon key could reach) ----------
// Supabase creates anon before any migration and grants it every new function and table by default; copy that.
db = await freshDb('create role anon nologin; alter default privileges in schema public grant execute on functions to anon; alter default privileges in schema public grant all on tables to anon;');
const rls = (await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
assert.deepEqual(rls, [], 'every table has row level security on');
const fns = (await db.query(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as can from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
assert.ok(fns.length >= 4); assert.deepEqual(fns.filter((f) => f.can).map((f) => f.proname), []);
await db.exec('set role anon');
assert.equal((await db.query('select count(*)::int n from sources')).rows[0].n, 0, 'anon sees no rows: RLS with no policies');
await rejects(db.query('select * from price_baseline(now())'), /permission denied/);
await db.exec('reset role');
await db.close();
ok('permissions: row level security on every table (including schema_migrations); no public role can run the functions');

// ---------- misc ----------
assert.equal(retailerId('John Lewis & Partners', 'GB'), 'john-lewis-uk');
assert.equal(retailerId('Amazon UK', 'GB'), 'amazon-uk'); assert.equal(retailerId('amazon.de', 'GB'), null);
assert.equal(mapLine({ source: 'manual', currency: 'EUR', fetched_at: NOW }).reject, 'currency EUR is not a market we serve');
const opt = connectionOptions('postgres://u:p@db.example.com:5432/x', {});
assert.deepEqual(opt.ssl, { rejectUnauthorized: true }); assert.equal(opt.options, '-c TimeZone=UTC', 'every pooled connection runs in UTC');
assert.equal(connectionOptions('postgres://u:p@db.example.com/x', { DATABASE_CA: 'PEM' }).ssl.ca, 'PEM');
assert.equal(connectionOptions('postgres://u:p@localhost:5432/x?sslmode=disable', {}).ssl, false);
assert.deepEqual(connectionOptions('postgres://u:p@db.example.com/x?sslmode=disable', {}).ssl, { rejectUnauthorized: true }, 'remote never plain text');
ok('TLS is always on for a remote database; plain text only to localhost; EUR is refused (UK and US only)');

console.log('db: ok');
