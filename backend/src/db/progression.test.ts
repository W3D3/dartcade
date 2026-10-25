import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { grantXp, hasPerk, revokeGameXp, unlockedPerks, unlockedPictures } from './progression.js'
import { levelPerks, xpForLevel } from '../shared/progression.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('unlocked perks', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('progression_db_test'))
    await db
      .insertInto('user')
      .values([
        { id: 'vet', name: 'Vet', email: 'vet@example.com', emailVerified: false, image: null },
        { id: 'new', name: 'New', email: 'new@example.com', emailVerified: false, image: null },
      ])
      .execute()
    // Level 30 with a 30-day best streak, unlocked under the old catalogue: rows for retired perks only
    await db
      .insertInto('user_progress')
      .values({ user_id: 'vet', xp_total: xpForLevel(30), level: 30, streak_best: 30 })
      .execute()
    await db
      .insertInto('user_unlocks')
      .values([
        { user_id: 'vet', perk_id: 'title.finisher', source: 'level' },
        { user_id: 'vet', perk_id: 'picture.star', source: 'level' },
        { user_id: 'vet', perk_id: 'colors.oche-red', source: 'event' },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it("holds every perk a player's level and best streak reach, even ones added after they got there", async () => {
    const held = await unlockedPerks(db, 'vet')
    for (const p of levelPerks(30)) expect(held, p.id).toContain(p.id)
    expect(held).toEqual(
      expect.arrayContaining(['frame.gold', 'celebration.confetti', 'banner.gold', 'colors.gold-leaf', 'colors.oche-red']),
    )
    expect(held).not.toContain('frame.platinum')
    expect(await hasPerk(db, 'vet', 'frame.gold')).toBe(true)
    expect(await unlockedPictures(db, 'vet')).toEqual(['classic', 'chalk', 'arcade', 'bronze', 'chrome', 'hot-streak'])
  })

  it('ignores retired perk ids', async () => {
    const held = await unlockedPerks(db, 'vet')
    expect(held).not.toContain('title.finisher')
    expect(held).not.toContain('picture.star')
  })

  it('gives a player with no progress the level 1 perks', async () => {
    expect(await unlockedPerks(db, 'new')).toEqual(levelPerks(1).map(p => p.id))
    expect(await hasPerk(db, 'new', 'frame.bronze')).toBe(false)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('grantXp', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('progression_grant_test'))
    await db
      .insertInto('user')
      .values([
        { id: 'admin', name: 'Admin', email: 'admin@example.com', emailVerified: true, image: null, role: 'admin' },
        { id: 'p', name: 'P', email: 'p@example.com', emailVerified: false, image: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it('writes a ledger row, the total and level, the unlocks and an audit row; a revoked game keeps it', async () => {
    // XP from a game first, so the revoke below has something else to take back
    await db
      .insertInto('xp_ledger')
      .values({ user_id: 'p', kind: 'game', source_type: 'game', source_id: 'g1', amount: 50, local_date: '2026-10-01' })
      .execute()
    await db.insertInto('user_progress').values({ user_id: 'p', xp_total: 50, level: 1 }).execute()

    const amount = xpForLevel(10) - 50
    const result = await grantXp(db, 'admin', 'p', amount)
    expect(result).toEqual({ xp: xpForLevel(10), level: 10, unlocked: expect.any(Array) })
    if (result === 'not-found') return
    const free = new Set(levelPerks(1).map(p => p.id))
    const levelTen = levelPerks(10)
      .map(p => p.id)
      .filter(id => !free.has(id))
    expect(levelTen.length).toBeGreaterThan(0)
    expect(result.unlocked).toEqual(expect.arrayContaining(levelTen))

    const ledger = await db.selectFrom('xp_ledger').select(['kind', 'source_type', 'amount', 'meta']).where('kind', '=', 'admin').execute()
    expect(ledger).toEqual([{ kind: 'admin', source_type: 'admin', amount, meta: { adminId: 'admin' } }])
    const rows = await db.selectFrom('user_unlocks').select('perk_id').where('user_id', '=', 'p').execute()
    expect(rows.map(r => r.perk_id).sort()).toEqual([...result.unlocked].sort())
    const audit = await db.selectFrom('admin_audit').select(['admin_user_id', 'action', 'target', 'detail']).execute()
    expect(audit).toEqual([
      {
        admin_user_id: 'admin',
        action: 'user.grantXp',
        target: 'p',
        detail: { amount, before: 50, after: xpForLevel(10), unlocked: result.unlocked },
      },
    ])

    await db.transaction().execute(trx => revokeGameXp(trx, 'g1'))
    const progress = await db.selectFrom('user_progress').select(['xp_total', 'level']).where('user_id', '=', 'p').executeTakeFirstOrThrow()
    expect(progress).toEqual({ xp_total: amount, level: 9 })
  })

  it('says not-found for an unknown account', async () => {
    expect(await grantXp(db, 'admin', 'ghost', 10)).toBe('not-found')
  })
})
