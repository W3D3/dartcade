import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { hasPerk, unlockedPerks, unlockedPictures } from './progression.js'
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
