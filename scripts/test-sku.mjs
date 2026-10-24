// Offline tests for the catalogue id. No database.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkChar, gtinInText, identify, parseGtin, skuForGtin, skuForWatch, skuFromKey, validSku } from './sku.mjs';

const ok = (m) => console.log('✓ ' + m);

const ean = '4006381333931';
assert.equal(parseGtin(ean), '04006381333931');
assert.equal(parseGtin('04006381333931'), '04006381333931');
assert.equal(parseGtin('4006381333932'), null);
assert.equal(parseGtin('not-a-barcode'), null);
assert.equal(parseGtin(''), null);
ok('GTIN: EAN-13 4006381333931 normalises to GTIN-14 and a wrong check digit is rejected');

assert.equal(gtinInText('LEGO set 4006381333931 Titanic'), '04006381333931');
assert.equal(gtinInText('Sony WH-1000XM5 headphones'), null);
assert.equal(gtinInText('order 400638133393199'), null);
ok('a barcode is read from a title only when it is its own digit run and the check digit passes');

const a = skuForGtin(ean);
const b = skuForGtin('04006381333931');
assert.equal(a, b);
assert.ok(validSku(a));
assert.equal(a.length, 12);
assert.equal(a.slice(0, 2), 'DC');
assert.notEqual(skuFromKey('gtin:04006381333931'), skuFromKey('gtin:00000000000000'));
assert.equal(skuForWatch('sony-wh-1000xm5'), skuForWatch('sony-wh-1000xm5'));
assert.notEqual(skuForWatch('sony-wh-1000xm5'), skuForGtin(ean));
assert.equal(validSku(a.slice(0, 11) + (a[11] === '0' ? '1' : '0')), false);
assert.equal(checkChar(''), null);
ok('the same barcode or watch id always mints the same 12-character id, and a flipped check character is rejected');

assert.equal(identify({ gtin: ean, watchId: 'sony-wh-1000xm5' }).basis, 'gtin');
assert.equal(identify({ gtin: ean }).sku, a);
assert.equal(identify({ watchId: 'sony-wh-1000xm5' }).basis, 'watch');
assert.equal(identify({ title: 'Sony WH-1000XM5 headphones' }).basis, 'none');
assert.equal(identify({ title: 'Sony WH-1000XM5 headphones' }).sku, null);
assert.equal(identify({}).sku, null);
ok('a barcode beats a watch id; a title never mints a catalogue id');

const watch = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'watchlist.json'), 'utf8'));
for (const item of watch.items) {
  assert.equal(item.sku, skuForWatch(item.id), item.id);
  assert.ok(validSku(item.sku));
}
ok('every watch-list item carries the catalogue id minted from its id');

console.log('sku: ok');
