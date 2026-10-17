import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.js'

export function createDb(url: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  })
}

/**
 * Takes the lock that keeps a second backend off this database, on a client of its own that
 * stays open for the process's life (the pool's connections come and go). null when another
 * backend holds it.
 */
export async function takeInstanceLock(url: string): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: url })
  // Postgres restarting drops the lock: keep serving, but say so
  client.on('error', err => {
    console.error('Lost the lock that keeps a second backend off the database', err)
  })
  await client.connect()
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext('dartcade.instance.' || current_schema())) AS ok`,
  )
  if (rows[0]?.ok) return client
  await client.end()
  return null
}

export const url =
  process.env.DATABASE_URL ??
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE}`
    : 'postgres://postgres:postgres@localhost:5432/dartcade')

export const db: Kysely<Database> = createDb(url)
