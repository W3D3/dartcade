import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { deleteOverride, loadOverrides, upsertOverride } from './flagOverrides.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('flag overrides', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('flag_overrides_test'))
    await db.insertInto('user').values({ id: 'admin1', name: 'Admin', email: 'admin1@x', emailVerified: false, image: null }).execute()
  })
  afterAll(async () => {
    await close()
  })

  it('has no overrides to start with', async () => {
    expect(await loadOverrides(db)).toEqual(new Map())
  })

  it('round-trips a mode override with who and when', async () => {
    await upsertOverride(db, 'gamemode.minigolf.enabled', { mode: 'users', userIds: ['u1', 'u2'] }, 'admin1')
    const overrides = await loadOverrides(db)
    const o = overrides.get('gamemode.minigolf.enabled')
    expect(o).toMatchObject({ mode: 'users', userIds: ['u1', 'u2'], updatedBy: 'admin1' })
    expect(o?.updatedAt).toBeInstanceOf(Date)
  })

  it('round-trips a number override', async () => {
    await upsertOverride(db, 'matchmaking.visitSeconds', { number: 45 }, 'admin1')
    const overrides = await loadOverrides(db)
    expect(overrides.get('matchmaking.visitSeconds')).toMatchObject({ number: 45, updatedBy: 'admin1' })
  })

  it('upserting again replaces the row rather than adding one', async () => {
    await upsertOverride(db, 'gamemode.minigolf.enabled', { mode: 'off', userIds: [] }, 'admin1')
    const overrides = await loadOverrides(db)
    expect(overrides.get('gamemode.minigolf.enabled')).toMatchObject({ mode: 'off', userIds: [] })
    expect(overrides.size).toBe(2)
  })

  it('deleting removes the override', async () => {
    await deleteOverride(db, 'gamemode.minigolf.enabled')
    const overrides = await loadOverrides(db)
    expect(overrides.has('gamemode.minigolf.enabled')).toBe(false)
    expect(overrides.has('matchmaking.visitSeconds')).toBe(true)
  })
})
