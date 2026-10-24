// Applies db/migrations/NNNN_*.sql in order, each in its own transaction, once.
// An applied file whose contents later change is an error: write a new migration instead of editing an old one.
// CLI: DATABASE_URL=... node scripts/db/migrate.mjs
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, isMain } from './client.mjs';

export const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

export function listMigrations(dir = MIGRATIONS) {
  return readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort().map((f) => {
    const sql = readFileSync(join(dir, f), 'utf8');
    return { version: f.slice(0, 4), name: f, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

export async function migrate(db, dir = MIGRATIONS) {
  await db.exec(`create table if not exists schema_migrations (
    version text primary key, name text not null, checksum text not null, applied_at timestamptz not null default now());
    alter table schema_migrations enable row level security;`);
  const done = new Map((await db.query('select version, checksum from schema_migrations')).rows.map((r) => [r.version, r.checksum]));
  const applied = [];
  for (const m of listMigrations(dir)) {
    if (done.has(m.version)) {
      if (done.get(m.version) !== m.checksum) throw new Error(`migration ${m.name} was edited after it was applied; add a new migration instead`);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query('insert into schema_migrations (version, name, checksum) values ($1, $2, $3)', [m.version, m.name, m.checksum]);
    });
    applied.push(m.name);
  }
  return applied;
}

if (isMain(import.meta)) {
  const db = await connect();
  try { const a = await migrate(db); console.log(a.length ? `applied: ${a.join(', ')}` : 'database is up to date'); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
  finally { await db.close(); }
}
