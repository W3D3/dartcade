import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.js'

export function createDb(url: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  })
}

const url =
  process.env.DATABASE_URL ??
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE}`
    : 'postgres://postgres:postgres@localhost:5432/dartcade')

export const db: Kysely<Database> = createDb(url)
