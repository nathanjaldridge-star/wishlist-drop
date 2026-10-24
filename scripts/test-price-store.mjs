// Offline tests for the MySQL writer. The driver is a fake; nothing listens on a port.
import assert from 'node:assert';
import { skuForGtin, skuForWatch, validSku } from './sku.mjs';
import { baselineQuery, poolOptions, rowFromEbay, rowFromHukd, toMysqlTime, writePrices } from './price-store.mjs';

const ok = (m) => console.log('✓ ' + m);
const EAN = '4006381333931';

const ebay = rowFromEbay({
  watch_id: 'sony-wh-1000xm5', fetched_at: '2026-10-24T12:37:00Z', retailer: 'eBay',
  canonical_url: 'https://www.ebay.co.uk/itm/112', title: 'Sony WH-1000XM5', current_price: 24999,
  delivery_cost: 349, currency: 'GBP', in_stock: true, confidence: 0.9, error_state: 'ok', product_id: 'ebay:112',
});
assert.equal(ebay.externalId, 'watch:sony-wh-1000xm5');
assert.equal(ebay.watchId, 'sony-wh-1000xm5');
assert.equal(rowFromEbay({ title: 'Sony WH-1000XM5' }), null);
ok('an eBay log line is stored against the watch id, and a title alone is not a row');

const bare = rowFromHukd({ guid: 'hukd:1', observed_at: '2026-10-24T12:00:00Z', merchant: 'Argos', title: 'Sony WH-1000XM5', price: 19900, link: 'https://www.hotukdeals.com/deals/x', currency: 'GBP' });
assert.equal(bare.gtin, null);
assert.equal(bare.externalId, 'hukd:1');
const coded = rowFromHukd({ guid: 'hukd:2', observed_at: '2026-10-24T12:00:00Z', merchant: 'LEGO', title: 'LEGO ' + EAN, price: 5000, link: 'https://www.hotukdeals.com/deals/y' });
assert.equal(coded.gtin, '04006381333931');
ok('a HotUKDeals title does not become a product unless it contains a valid barcode');

const calls = [];
const query = async (sql, params) => {
  calls.push({ sql, params });
  assert.equal(sql.includes('${'), false);
  assert.ok(!sql.includes(ebay.title) || sql.includes('?'), 'values stay in parameters');
  if (sql.startsWith('INSERT INTO listings')) return { insertId: calls.length };
  return { insertId: 1 };
};
const saved = await writePrices(query, [ebay, bare, coded]);
assert.equal(saved.products, 2);
assert.equal(saved.unidentified, 1);
assert.equal(saved.observations, 3);
const productSql = calls.filter((c) => c.sql.startsWith('INSERT INTO products'));
assert.equal(productSql.length, 2);
assert.deepEqual(productSql[0].params[0], skuForWatch('sony-wh-1000xm5'));
assert.equal(productSql[0].params[1], null);
assert.equal(productSql[1].params[0], skuForGtin(EAN));
assert.equal(productSql[1].params[1], '04006381333931');
const obs = calls.filter((c) => c.sql.startsWith('INSERT INTO price_observations'));
assert.equal(obs[0].params[0], skuForWatch('sony-wh-1000xm5'));
assert.equal(obs[0].params[3], 24999);
assert.equal(obs[1].params[0], null);
assert.equal(obs[2].params[0], skuForGtin(EAN));
assert.ok(calls.every((c) => !/\bLIKE\b/i.test(c.sql) && !/title\s*=\s*\?/i.test(c.sql.split('WHERE')[1] || '')));
ok('writes key off the catalogue id; a title-only deal is stored with a null sku and is not joined');

const sku = skuForWatch('sony-wh-1000xm5');
assert.ok(validSku(sku));
const q = baselineQuery(sku, '2026-10-24T12:37:00Z');
assert.match(q.sql, /WHERE sku = \?/);
assert.doesNotMatch(q.sql, /title/);
assert.deepEqual(q.params, [sku, '2026-09-24 12:37:00.000', '2026-10-24 12:37:00.000']);
assert.throws(() => baselineQuery('Sony WH-1000XM5', '2026-10-24T12:37:00Z'));
assert.equal(toMysqlTime('2026-10-24T12:37:00Z'), '2026-10-24 12:37:00.000');
ok('the 30-day low is a query on sku, and a product description is rejected');

const opt = poolOptions('mysql://drop:s3cret@db.internal:3306/dropclub?ssl=1');
assert.equal(opt.password, 's3cret');
assert.equal(opt.database, 'dropclub');
assert.equal(opt.port, 3306);
assert.ok(opt.ssl);
assert.throws(() => poolOptions('postgres://x'));
ok('MYSQL_URL parses without the password being written into a query');

console.log('price-store: ok');
