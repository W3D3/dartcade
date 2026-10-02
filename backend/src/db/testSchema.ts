import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations } from './queries.js'
import type { Database } from './schema.js'

/**
 * A fresh, migrated Postgres schema of its own for one DB test file: Vitest runs files in
 * parallel, and queries.test.ts wipes the shared tables. Needs TEST_DATABASE_URL.
 */
export async function openTestSchema(schema: string): Promise<{ db: Kysely<Database>; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL ?? ''
  const admin = createDb(url)
  await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(admin)
  await sql.raw(`CREATE SCHEMA ${schema}`).execute(admin)
  const db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${schema}`)
  await runMigrations(db)
  return {
    db,
    close: async () => {
      await db.destroy()
      await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(admin)
      await admin.destroy()
    },
  }
}
