// Writes the per-listing price summary the static site can read (no browser ever talks to the database).
// Output follows each source's licence: stale eBay rows carry their age, baseline fields are null where maths is not allowed,
// and nothing claims a "30-day low" until 30 days of history exist (building_history: true).
// CLI: DATABASE_URL=... node scripts/db/export.mjs prices.json
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { connect, isMain } from './client.mjs';

export async function exportSummary(db, asOf = new Date()) {
  const at = new Date(asOf).toISOString();
  // Only listings tied to a catalogue product: the app looks prices up by catalogue id, and deal posts are not products.
  const { rows } = await db.query(`select b.*, p.is_example, p.title from price_baseline($1) b join sources s on s.id = b.source
    join products p on p.catalogue_id = b.catalogue_id where s.enabled order by b.catalogue_id, b.market, b.retailer_id`, [at]);
  return {
    version: 1, generated_at: at,
    label: 'Prices from Drop Club\'s own history. 30-day low = lowest price at the same retailer in the prior 30 days; shown only after 30 days of history.',
    items: rows.map((r) => ({
      catalogue_id: r.catalogue_id.trim(), title: r.title, source: r.source, retailer: r.retailer_id, retailer_name: r.retailer_name, market: r.market.trim(), currency: r.currency.trim(),
      current_price: r.current_minor, checked_at: new Date(r.current_at).toISOString(), fresh: r.fresh,
      age_minutes: Math.floor((Date.parse(at) - new Date(r.current_at).getTime()) / 60000),
      baseline_allowed: r.baseline_allowed, low_30d: r.low_30d_minor, history_days: r.history_days, building_history: r.baseline_allowed && r.building_history,
      drop_pct: r.drop_pct == null ? null : Number(r.drop_pct), may_alert: r.may_alert, ...(r.is_example ? { example: true } : {}),
    })),
  };
}

if (isMain(import.meta)) {
  const outPath = process.argv[2] || 'prices.json';
  const db = await connect();
  try {
    const j = await exportSummary(db);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath + '.tmp', JSON.stringify(j) + '\n'); renameSync(outPath + '.tmp', outPath);
    console.log(`export: ${j.items.length} listings -> ${outPath}`);
  } catch (e) { console.error('export failed: ' + e.message); process.exitCode = 1; } finally { await db.close(); }
}
