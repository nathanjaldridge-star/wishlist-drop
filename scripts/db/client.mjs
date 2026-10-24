// Database connection for jobs (GitHub Actions). The browser never connects to the database.
// DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB  (a repo secret; never commit it, never put it in chat)
// TLS is required and the certificate is verified. Supabase signs with its own CA: put the PEM text in DATABASE_CA (a repo
// variable, it is public) or a file path in DATABASE_CA_FILE. From GitHub Actions use Supabase's *session pooler* string:
// the direct db.<ref>.supabase.co host is IPv6-only on the free plan and Actions runners are IPv4-only.
// Plain-text connections are allowed only to localhost, for local development.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function connectionOptions(url, env = process.env) {
  const u = new URL(url);
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('DATABASE_URL must start with postgres://');
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const ssl = local && u.searchParams.get('sslmode') === 'disable' ? false
    : { rejectUnauthorized: true, ...(env.DATABASE_CA ? { ca: env.DATABASE_CA } : env.DATABASE_CA_FILE ? { ca: readFileSync(env.DATABASE_CA_FILE, 'utf8') } : {}) };
  u.searchParams.delete('sslmode');
  return { connectionString: u.toString(), ssl, max: 2, statement_timeout: 30000, application_name: 'dropclub-jobs', options: '-c TimeZone=UTC' };
}

/** Same shape as the PGlite test database: query(sql, params) -> {rows}, exec(sql), transaction(fn), close(). */
export async function connect(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const { default: pg } = await import('pg');
  const pool = new pg.Pool(connectionOptions(env.DATABASE_URL, env));
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const out = await fn({ query: (s, p) => c.query(s, p), exec: (s) => c.query(s) });
        await c.query('commit');
        return out;
      } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

export const isMain = (meta) => Boolean(process.argv[1]) && meta.url === pathToFileURL(process.argv[1]).href;
