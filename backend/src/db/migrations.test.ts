import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations } from './queries.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
const SCHEMA = 'mig_006_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('006_game_history migration', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db, { until: '005_session_owner.sql' })
    await sql`INSERT INTO "user" (id, name, email) VALUES ('u1', 'Christoph', 'c@example.com')`.execute(db)
    await sql`INSERT INTO game_sessions (id, game_id, config, players, status, owner_user_id)
      VALUES ('old-finished', 'x01', '{}', '[{"name":"Christoph"},{"name":"Guest"}]', 'finished', 'u1'),
             ('old-active', 'atc', '{}', '[{"name":"Christoph"}]', 'active', 'u1')`.execute(db)
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('moves players into seats, the creator holding seat 0', async () => {
    const seats = await db.selectFrom('game_players').selectAll().where('session_id', '=', 'old-finished').orderBy('seat').execute()
    expect(seats.map(s => [s.seat, s.name, s.user_id, s.placement])).toEqual([[0, 'Christoph', 'u1', null], [1, 'Guest', null, null]])
  })

  it('aborts games that were running', async () => {
    const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'old-active').executeTakeFirstOrThrow()
    expect(row.status).toBe('aborted')
    expect(row.finished_at).toBeInstanceOf(Date)
  })

  it('keeps finished games finished, without placements', async () => {
    const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'old-finished').executeTakeFirstOrThrow()
    expect(row.status).toBe('finished')
    expect(row.visibility).toBe('private')
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('013_unique_names migration', () => {
  const SCHEMA_013 = 'mig_013_test'
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_013} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA_013}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA_013}`)
    await runMigrations(db, { until: '012_voice_packs.sql' })
    await sql`INSERT INTO "user" (id, name, email, "createdAt") VALUES
      ('u1', 'Luke', 'u1@x', '2026-01-01'), ('u2', 'luke', 'u2@x', '2026-02-01'), ('u3', 'LUKE', 'u3@x', '2026-03-01'),
      ('u4', 'Phil Taylor', 'u4@x', '2026-01-01'), ('u5', 'x', 'u5@x', '2026-01-01'), ('u6', 'sam.180', 'u6@x', '2026-01-01')`.execute(db)
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_013} CASCADE`).execute(admin)
    await admin.destroy()
  })

  const flagged = async () => (await db.selectFrom('user').select(['id', 'name_needs_change']).orderBy('id').execute())
    .filter(u => u.name_needs_change).map(u => u.id)

  it('flags all but the oldest of each case-insensitive group, and names that break the rules', async () => {
    expect(await flagged()).toEqual(['u2', 'u3', 'u4', 'u5'])
  })

  it('keeps names unique ignoring case from now on, flagged names aside', async () => {
    await expect(sql`INSERT INTO "user" (id, name, email) VALUES ('u7', 'SAM.180', 'u7@x')`.execute(db)).rejects.toMatchObject({ code: '23505' })
    await sql`INSERT INTO "user" (id, name, email, name_needs_change) VALUES ('u8', 'Luke', 'u8@x', true)`.execute(db)
  })
})
