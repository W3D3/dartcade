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
import { xpForTiers } from '../shared/achievements.js'
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
      { id: 'cid', emailVerified: true },
    ])
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    pushed = []
    on = true
    signInAs('ann')
    service = new AchievementsService({
      db,
      enabled: () => Promise.resolve(on),
      push: (userId, msg) => void (userId === 'ann' && pushed.push(msg)),
      warn: () => undefined,
    })
    await sql`TRUNCATE user_achievements, achievement_tiers, achievement_source_backfill, achievement_games, xp_ledger, user_progress, game_sessions CASCADE`.execute(
      db,
    )
  })

  /** A finished 1v1 where ann throws `bulls` bullseyes and fills the rest of her visits with singles. */
  async function duel(bulls: number, mode = 'x01'): Promise<string> {
    const id = `g${++n}`
    // One minute apart: games are counted again in the order they finished
    const at = new Date(Date.parse('2026-10-21T12:00:00Z') + n * 60_000)
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

  const tiers = () =>
    db
      .selectFrom('achievement_tiers')
      .select(['tier', 'game_id', 'source'])
      .where('user_id', '=', 'ann')
      .where('achievement_id', '=', 'x01.bullseye')
      .orderBy('tier')
      .execute()
  const bulls = Array.from({ length: 3 }, () => ({ number: 25, multiplier: 2 }))

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
    expect(r).toMatchObject({ count: 12, tier: 1 })
    // the 10th bull is the second game's 4th: ann's second visit (game visit 2), its first dart
    expect(await tiers()).toEqual([{ tier: 1, game_id: `g${n}`, source: { visit: 2, leg: 0, legVisit: 2, darts: bulls, dart: 0 } }])
    expect(pushed).toEqual([expect.objectContaining({ unlocked: [{ id: 'x01.bullseye', from: 0, tier: 1, count: 12, xp: 100 }] })])
    expect((await getProgress(db, 'ann')).xp).toBe(100)
    // bob threw no bulls: nothing for him
    expect(await db.selectFrom('user_achievements').select('user_id').where('user_id', '=', 'bob').execute()).toEqual([])
  })

  it("pushes each game's tier changes with the tier before it, and nothing for a game that changed none", async () => {
    const first = await duel(12)
    await service.countGame(first)
    // 15, 27, 39: still tier 1, nothing to tell
    for (const bulls of [3, 12, 12]) await service.countGame(await duel(bulls))
    const up = await duel(12)
    await service.countGame(up)
    expect(pushed.map(m => [m.sessionId, m.unlocked])).toEqual([
      [first, [{ id: 'x01.bullseye', from: 0, tier: 1, count: 12, xp: xpForTiers(0, 1) }]],
      [up, [{ id: 'x01.bullseye', from: 1, tier: 2, count: 51, xp: xpForTiers(1, 2) }]],
    ])
    // the 10th is the first game's 10th bull (ann's fourth visit, game visit 6); from 39, the 50th is the 11th
    expect(await tiers()).toEqual([
      { tier: 1, game_id: first, source: { visit: 6, leg: 0, legVisit: 4, darts: bulls, dart: 0 } },
      { tier: 2, game_id: up, source: { visit: 6, leg: 0, legVisit: 4, darts: bulls, dart: 1 } },
    ])
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

  it('places the tiers reached before their visits were kept, once, and keeps a tier it cannot place', async () => {
    const first = await duel(12)
    await service.countGame(first)
    for (const b of [3, 12, 12]) await service.countGame(await duel(b))
    const up = await duel(12)
    await service.countGame(up)
    const placed = await tiers()
    // as migration 079 left them: tier 1 with the first time and no game, the latest tier with its game
    const old = new Date('2026-01-01T00:00:00Z')
    await db.updateTable('achievement_tiers').set({ source: null, game_id: null, reached_at: old }).where('tier', '=', 1).execute()
    await db.updateTable('achievement_tiers').set({ source: null }).where('tier', '=', 2).execute()
    // a tier no game reaches any more (its game since invalidated, say)
    await db
      .insertInto('user_achievements')
      .values({ user_id: 'ann', achievement_id: 'x01.180', count: 1, tier: 1, showcase_slot: null })
      .execute()
    await db
      .insertInto('achievement_tiers')
      .values({ user_id: 'ann', achievement_id: 'x01.180', tier: 1, reached_at: old, game_id: null, source: null })
      .execute()

    expect(await service.locateTiers()).toBe(2)
    expect(await tiers()).toEqual(placed)
    const reached = await db
      .selectFrom('achievement_tiers')
      .select('reached_at')
      .where('tier', '=', 1)
      .where('achievement_id', '=', 'x01.bullseye')
      .executeTakeFirstOrThrow()
    expect(reached.reached_at).not.toEqual(old)
    expect(
      await db.selectFrom('achievement_tiers').select(['game_id', 'source']).where('achievement_id', '=', 'x01.180').executeTakeFirst(),
    ).toEqual({ game_id: null, source: null })
    // done once: a second start looks no more
    expect(await service.locateTiers()).toBe(0)
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

    it('links each tier to its game only for a viewer who may open it, and marks a game that is gone', async () => {
      await service.countGame(await duel(6))
      const id = await duel(6)
      await service.countGame(id)
      const tierOf = async (viewer: string) => {
        signInAs(viewer)
        const res = await app().inject({ method: 'GET', url: '/api/users/ann/achievements' })
        return res.json().achievements[0].tiers[0]
      }
      const where = { visit: 2, leg: 0, legVisit: 2, darts: bulls, dart: 0 }
      expect(await tierOf('ann')).toMatchObject({ tier: 1, where, gameId: id, gone: false })
      // bob played in it; cid did not, and it is not public
      expect(await tierOf('bob')).toMatchObject({ gameId: id })
      expect(await tierOf('cid')).toMatchObject({ where, gameId: null, gone: false })
      await db.updateTable('game_sessions').set({ visibility: 'public' }).where('id', '=', id).execute()
      expect(await tierOf('cid')).toMatchObject({ gameId: id })
      await db.updateTable('game_sessions').set({ invalidated_at: new Date() }).where('id', '=', id).execute()
      expect(await tierOf('ann')).toMatchObject({ where, gameId: null, gone: true })
      await db.deleteFrom('game_sessions').where('id', '=', id).execute()
      expect(await tierOf('ann')).toMatchObject({ where, gameId: null, gone: true })
    })
  })
})
