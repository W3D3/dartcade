import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb, takeInstanceLock } from './index.js'
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
    expect(seats.map(s => [s.seat, s.name, s.user_id, s.placement])).toEqual([
      [0, 'Christoph', 'u1', null],
      [1, 'Guest', null, null],
    ])
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

  const flagged = async () =>
    (await db.selectFrom('user').select(['id', 'name_needs_change']).orderBy('id').execute())
      .filter(u => u.name_needs_change)
      .map(u => u.id)

  it('flags all but the oldest of each case-insensitive group, and names that break the rules', async () => {
    expect(await flagged()).toEqual(['u2', 'u3', 'u4', 'u5'])
  })

  it('keeps names unique ignoring case from now on, flagged names aside', async () => {
    await expect(sql`INSERT INTO "user" (id, name, email) VALUES ('u7', 'SAM.180', 'u7@x')`.execute(db)).rejects.toMatchObject({
      code: '23505',
    })
    await sql`INSERT INTO "user" (id, name, email, name_needs_change) VALUES ('u8', 'Luke', 'u8@x', true)`.execute(db)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('028_email_verification migration', () => {
  const SCHEMA_028 = 'mig_028_test'
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_028} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA_028}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA_028}`)
    await runMigrations(db, { until: '027_wled_lights.sql' })
    await sql`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ('u1', 'Luke', 'u1@x', false)`.execute(db)
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_028} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('counts accounts from before verification as verified, with no terms acceptance recorded', async () => {
    const row = await db.selectFrom('user').select(['emailVerified', 'terms_accepted_at']).where('id', '=', 'u1').executeTakeFirstOrThrow()
    expect(row.emailVerified).toBe(true)
    expect(row.terms_accepted_at).toBeNull()
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('035_retired_avatar_presets migration', () => {
  const SCHEMA_035 = 'mig_035_test'
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_035} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA_035}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA_035}`)
    await runMigrations(db, { until: '034_user_unlocks.sql' })
    await sql`INSERT INTO "user" (id, name, email, avatar_preset, avatar_color, avatar_fg_color) VALUES
      ('u1', 'Star', 'u1@x', 'star', '#2d6cdf', '#ffffff'), ('u2', 'Crown', 'u2@x', 'crown', '#c0392b', '#000000'),
      ('u3', 'Dart', 'u3@x', 'dart', '#3a8f4a', '#ffffff')`.execute(db)
    await runMigrations(db, { until: '035_retired_avatar_presets.sql' })
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_035} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('puts wearers of a retired picture back on the mark, keeping their colours', async () => {
    // The colour columns are gone from 038 on, so not in the typed schema
    const { rows } = await sql<{
      id: string
      avatar_preset: string
      avatar_color: string
      avatar_fg_color: string
    }>`SELECT id, avatar_preset, avatar_color, avatar_fg_color FROM "user" ORDER BY id`.execute(db)
    expect(rows.map(r => [r.id, r.avatar_preset, r.avatar_color, r.avatar_fg_color])).toEqual([
      ['u1', 'logo', '#2d6cdf', '#ffffff'],
      ['u2', 'logo', '#c0392b', '#000000'],
      ['u3', 'dart', '#3a8f4a', '#ffffff'],
    ])
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('038_avatar_finishes migration', () => {
  const SCHEMA_038 = 'mig_038_test'
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_038} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA_038}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA_038}`)
    await runMigrations(db, { until: '037_bridge_install_tokens.sql' })
    await sql`INSERT INTO "user" (id, name, email, avatar_kind, avatar_preset) VALUES
      ('u1', 'Flame', 'u1@x', 'preset', 'flame'), ('u2', 'Logo', 'u2@x', 'preset', 'logo'),
      ('u3', 'Odd', 'u3@x', 'preset', 'target'), ('u4', 'Initials', 'u4@x', 'none', NULL)`.execute(db)
    await sql`INSERT INTO user_unlocks (user_id, perk_id, source) VALUES
      ('u1', 'picture.flame', 'streak'), ('u1', 'picture.dart', 'level'), ('u1', 'title.chalker', 'level'),
      ('u2', 'picture.shield', 'event'), ('u2', 'picture.crystal', 'event')`.execute(db)
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_038} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('puts each old picture on both layers as its finish', async () => {
    const rows = await db.selectFrom('user').select(['id', 'avatar_kind', 'avatar_preset', 'avatar_background']).orderBy('id').execute()
    expect(rows.map(r => [r.id, r.avatar_kind, r.avatar_preset, r.avatar_background])).toEqual([
      ['u1', 'preset', 'hot-streak', 'hot-streak'],
      ['u2', 'preset', 'classic', 'classic'],
      ['u3', 'preset', 'classic', 'classic'],
      ['u4', 'none', null, null],
    ])
  })

  it('renames the picture rewards, keeping one row where the new id was already held', async () => {
    const rows = await db.selectFrom('user_unlocks').select(['user_id', 'perk_id']).orderBy('user_id').orderBy('perk_id').execute()
    expect(rows.map(r => [r.user_id, r.perk_id])).toEqual([
      ['u1', 'picture.chalk'],
      ['u1', 'picture.hot-streak'],
      ['u1', 'title.chalker'],
      ['u2', 'picture.crystal'],
    ])
  })

  it('starts new accounts on classic on classic', async () => {
    await sql`INSERT INTO "user" (id, name, email) VALUES ('u5', 'New', 'u5@x')`.execute(db)
    const row = await db.selectFrom('user').select(['avatar_preset', 'avatar_background']).where('id', '=', 'u5').executeTakeFirstOrThrow()
    expect(row).toEqual({ avatar_preset: 'classic', avatar_background: 'classic' })
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('two backends on one database', () => {
  const SCHEMA_LOCK = 'mig_lock_test'
  const schemaUrl = `${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA_LOCK}`
  let admin: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_LOCK} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA_LOCK}`).execute(admin)
  })

  afterAll(async () => {
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA_LOCK} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('run the migrations one after the other when they boot together', async () => {
    const a = createDb(schemaUrl)
    const b = createDb(schemaUrl)
    try {
      await Promise.all([runMigrations(a), runMigrations(b)])
    } finally {
      await Promise.all([a.destroy(), b.destroy()])
    }
  })

  it('lets only one hold the instance lock, until it stops', async () => {
    const first = await takeInstanceLock(schemaUrl)
    expect(first).not.toBeNull()
    expect(await takeInstanceLock(schemaUrl)).toBeNull()
    await first?.end()
    const next = await takeInstanceLock(schemaUrl)
    expect(next).not.toBeNull()
    await next?.end()
  })
})
