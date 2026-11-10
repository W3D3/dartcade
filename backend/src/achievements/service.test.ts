import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { signInAs } from '../test/authAs.js'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertUsers } from '../test/fixtures.js'
import { createFastify } from '../api/fastify.js'
import { achievementsApiPlugin } from '../api/achievements.js'
import { AchievementsService } from './service.js'
import { getProgress } from '../db/progression.js'
import type { AchievementUnlockedMessage } from '../schema/lobby-ws.js'

signInAs('ann')
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn().mockResolvedValue(true), loadFlagUser: vi.fn() }))

const BULL = { name: 'DB', number: 25, bed: 'DoubleBull', multiplier: 2 }
const S1 = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 }

describe.skipIf(!process.env.TEST_DATABASE_URL)('AchievementsService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let pushed: AchievementUnlockedMessage[]
  let service: AchievementsService
  let on: boolean
  let n = 0

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('achievements_service'))
    await insertUsers(db, [
      { id: 'ann', emailVerified: true },
      { id: 'bob', emailVerified: true },
    ])
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    pushed = []
    on = true
    service = new AchievementsService({
      db,
      enabled: () => Promise.resolve(on),
      push: (userId, msg) => void (userId === 'ann' && pushed.push(msg)),
      warn: () => undefined,
    })
    await sql`TRUNCATE user_achievements, achievement_games, xp_ledger, user_progress, game_sessions CASCADE`.execute(db)
  })

  /** A finished 1v1 where ann throws `bulls` bullseyes and fills the rest of her visits with singles. */
  async function duel(bulls: number, mode = 'x01'): Promise<string> {
    const id = `g${++n}`
    const at = new Date('2026-10-21T12:00:00Z')
    await db
      .insertInto('game_sessions')
      .values({ id, owner_user_id: 'ann', board_db_id: null, game_id: mode, config: '{}', status: 'finished', finished_at: at })
      .execute()
    await db
      .insertInto('game_players')
      .values(
        ['ann', 'bob'].map((u, seat) => ({
          session_id: id,
          seat,
          name: u,
          user_id: u,
          controller_user_id: u,
          placement: seat + 1,
          stats: '{}',
          throw_position: seat,
        })),
      )
      .execute()
    const darts = []
    for (let v = 0; v < 8; v++) {
      for (let i = 0; i < 3; i++) {
        const seat = v % 2
        const bull = seat === 0 && Math.floor(v / 2) * 3 + i < bulls
        darts.push({
          session_id: id,
          visit: v,
          dart_index: i,
          seat,
          leg: 0,
          phase: 'game',
          segment: JSON.stringify(bull ? BULL : S1),
          coords: null,
          source: 'camera',
          corrected: false,
          thrown_at: at,
        })
      }
    }
    await db.insertInto('game_darts').values(darts).execute()
    return id
  }

  const row = () =>
    db
      .selectFrom('user_achievements')
      .selectAll()
      .where('user_id', '=', 'ann')
      .where('achievement_id', '=', 'x01.bullseye')
      .executeTakeFirst()

  it('counts a game once, however often it is settled', async () => {
    const id = await duel(6)
    await service.countGame(id)
    await service.countGame(id)
    expect((await row())?.count).toBe(6)
    expect(pushed).toHaveLength(0)
  })

  it('unlocks tier 1 at the threshold, pays its XP once and pushes it', async () => {
    await service.countGame(await duel(6))
    await service.countGame(await duel(6))
    const r = await row()
    expect(r).toMatchObject({ count: 12, tier: 1, game_id: `g${n}` })
    expect(r?.earned_at).not.toBeNull()
    expect(pushed).toEqual([expect.objectContaining({ unlocked: [{ id: 'x01.bullseye', tier: 1, count: 12, tierUp: false, xp: 100 }] })])
    expect((await getProgress(db, 'ann')).xp).toBe(100)
    // bob threw no bulls: nothing for him
    expect(await db.selectFrom('user_achievements').select('user_id').where('user_id', '=', 'bob').execute()).toEqual([])
  })

  it('counts without paying or pushing while the flag is off', async () => {
    on = false
    await service.countGame(await duel(6))
    await service.countGame(await duel(6))
    expect((await row())?.tier).toBe(1)
    expect(pushed).toEqual([])
    expect((await getProgress(db, 'ann')).xp).toBe(0)
  })

  it('counts 121 Checkout with X01 as one countdown group, and no other mode', async () => {
    await service.countGame(await duel(10, 'p121'))
    expect(await row()).toMatchObject({ count: 10, tier: 1 })
    await service.countGame(await duel(10, 'atc'))
    expect((await row())?.count).toBe(10)
  })

  it('backfills the games nobody has counted, once, with no XP, and picks up a mode left out before', async () => {
    const a = await duel(6)
    await duel(6)
    await duel(6, 'p121')
    await service.countGame(a, { backfill: true })
    expect(await service.backfill()).toBe(2)
    expect(await service.backfill()).toBe(0)
    expect(await row()).toMatchObject({ count: 18, tier: 1 })
    expect((await getProgress(db, 'ann')).xp).toBe(0)
    expect(pushed).toEqual([])
  })

  it('does not list a game of guests and bots again and again', async () => {
    const id = `g${++n}`
    await db
      .insertInto('game_sessions')
      .values({ id, owner_user_id: 'ann', board_db_id: null, game_id: 'x01', config: '{}', status: 'finished', finished_at: new Date() })
      .execute()
    await db
      .insertInto('game_players')
      .values([
        { session_id: id, seat: 0, name: 'Guest', user_id: null, controller_user_id: 'ann', placement: 1, stats: '{}', throw_position: 0 },
        {
          session_id: id,
          seat: 1,
          name: 'Bot',
          user_id: null,
          controller_user_id: 'ann',
          placement: 2,
          stats: '{}',
          throw_position: 1,
          bot_level: 5,
        },
      ])
      .execute()
    expect(await service.backfill()).toBe(0)
  })

  it('finishes a game only one of its accounts was counted in', async () => {
    const id = await duel(6)
    // ann was counted (the run failed before bob's turn): bob still is not
    await db.insertInto('achievement_games').values({ user_id: 'ann', game_id: id }).execute()
    expect(await service.backfill()).toBe(1)
    const claimed = await db.selectFrom('achievement_games').select('user_id').where('game_id', '=', id).orderBy('user_id').execute()
    expect(claimed.map(r => r.user_id)).toEqual(['ann', 'bob'])
    // ann's count is not doubled by the second pass: her claim already stood
    expect((await row()) ?? null).toBeNull()
    expect(await service.backfill()).toBe(0)
  })

  describe('API', () => {
    const app = () => {
      const a = createFastify()
      a.register(achievementsApiPlugin, { db })
      return a
    }

    it('lists mine, saves a showcase of earned ones only and clears the new dot', async () => {
      await service.countGame(await duel(6))
      await service.countGame(await duel(6))
      const a = app()
      const mine = await a.inject({ method: 'GET', url: '/api/achievements' })
      expect(mine.json()).toMatchObject({
        achievements: [{ id: 'x01.bullseye', count: 12, tier: 1, isNew: true }],
        showcase: [],
        unseen: 1,
      })
      const bad = await a.inject({ method: 'PUT', url: '/api/achievements/showcase', payload: { ids: ['x01.180'] } })
      expect(bad.statusCode).toBe(400)
      const ok = await a.inject({ method: 'PUT', url: '/api/achievements/showcase', payload: { ids: ['x01.bullseye'] } })
      expect(ok.json().showcase).toEqual(['x01.bullseye'])
      expect((await a.inject({ method: 'POST', url: '/api/achievements/seen' })).statusCode).toBe(204)
      expect((await a.inject({ method: 'GET', url: '/api/achievements' })).json()).toMatchObject({
        unseen: 0,
        achievements: [{ isNew: false }],
      })
      const theirs = await a.inject({ method: 'GET', url: '/api/users/ann/achievements' })
      expect(theirs.statusCode).toBe(200)
      expect(theirs.json().achievements[0].isNew).toBe(false)
      expect((await a.inject({ method: 'GET', url: '/api/users/nobody/achievements' })).statusCode).toBe(404)
    })
  })
})
