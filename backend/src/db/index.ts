import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.js'

export function createDb(url: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  })
}

// Singleton used by auth module and seed; main index.ts also calls createDb directly
export const db: Kysely<Database> = createDb(
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/dartcade',
)
