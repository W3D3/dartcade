import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import {
  type RankedSide,
  getRatings,
  onlineAverage,
  ratingChangeSince,
  recentRanked,
  recalculateRatings,
  recordRankedResult,
  x01Average,
} from './ranked.js'
import { rankIndexFor } from '../shared/ranked.js'
import { DEFAULT_AVATAR_BG, DEFAULT_AVATAR_FG, DEFAULT_AVATAR_PRESET } from '../shared/avatarPresets.js'

const defaultAvatar = { kind: 'preset' as const, preset: DEFAULT_AVATAR_PRESET, color: DEFAULT_AVATAR_BG, fgColor: DEFAULT_AVATAR_FG }

describe.skipIf(!process.env.TEST_DATABASE_URL)('ranked tables', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let n = 0

  async function game(status = 'finished', gameId = 'x01'): Promise<string> {
    const id = `g${++n}`
    await db
      .insertInto('game_sessions')
      .values({
        id,
        owner_user_id: null,
        board_db_id: null,
        game_id: gameId,
        config: '{}',
        status,
        finished_at: new Date(Date.UTC(2026, 8, n)),
      })
      .execute()
    return id
  }

  async function played(userId: string, average: number, darts: number, gameId = 'x01') {
    const id = await game('finished', gameId)
    await db
      .insertInto('game_players')
      .values({
        session_id: id,
        seat: 0,
        name: userId,
        user_id: userId,
        placement: 1,
        stats: JSON.stringify({ average, dartsThrown: darts }),
        throw_position: 0,
        controller_user_id: userId,
        board_db_id: null,
        bot_level: null,
      })
      .execute()
  }

  const at = (day: number) => new Date(Date.UTC(2026, 9, day, 20))
  const duel = (winner: string, loser: string, wAvg: number | null, lAvg: number | null): [RankedSide, RankedSide] => [
    { won: true, players: [{ userId: winner, average: wAvg }] },
    { won: false, players: [{ userId: loser, average: lAvg }] },
  ]

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('ranked_db_test'))
    await db
      .insertInto('user')
      .values(
        ['chris', 'anna', 'lena', 'ben', 'tom', 'ida', 'sam', 'tim', 'ruth', 'sam2', 'tim2', 'ruth2', 'zoe', 'yan', 'eli', 'liv'].map(
          id => ({
            id,
            name: id[0].toUpperCase() + id.slice(1),
            email: `${id}@x`,
            emailVerified: false,
            image: null,
          }),
        ),
      )
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it('a player who never played starts at 1 200, unranked, in both modes', async () => {
    const r = await getRatings(db, 'tom')
    expect(r['1v1']).toEqual({ mode: '1v1', rating: 1200, rankIndex: null, matches: 0, wins: 0, streak: 0 })
    expect(r['2v2'].rating).toBe(1200)
    expect(await onlineAverage(db, 'tom')).toBeNull()
    expect(await recentRanked(db, 'tom')).toEqual([])
  })

  it('the X01 average weighs each game by its darts and skips other modes', async () => {
    expect(await x01Average(db, 'ida')).toBeNull()
    await played('ida', 60, 30)
    await played('ida', 40, 90)
    await played('ida', 99, 300, 'atc')
    expect(await x01Average(db, 'ida')).toBe(45)
  })

  it('a first ranked game starts the player from their X01 average', async () => {
    await recordRankedResult(db, { sessionId: await game(), mode: '1v1', at: at(1), sides: duel('ida', 'tom', 50, 50) })
    // Ida seeded at 1 050 (45 average) against Tom at 1 200 (no X01 games); even averages:
    // she scores 0.85 where Elo expected 0.30, 64 × 0.55 = 35 either way
    expect((await getRatings(db, 'ida'))['1v1'].rating).toBe(1085)
    expect((await getRatings(db, 'tom'))['1v1'].rating).toBe(1165)
  })

  it('a placement game counts the averages too, once per game', async () => {
    const g = await game()
    const sides = duel('chris', 'anna', 60, 50)
    await recordRankedResult(db, { sessionId: g, mode: '1v1', at: at(10), sides })
    await recordRankedResult(db, { sessionId: g, mode: '1v1', at: at(10), sides })
    // even ratings: winner 0.7 + 0.3 × 0.75 = 0.925 → +27; loser 0.3 × 0.25 = 0.075 → −27
    expect((await getRatings(db, 'chris'))['1v1']).toMatchObject({ rating: 1227, matches: 1, wins: 1, streak: 1, rankIndex: null })
    expect((await getRatings(db, 'anna'))['1v1']).toMatchObject({ rating: 1173, matches: 1, wins: 0, streak: -1 })
    expect((await getRatings(db, 'chris'))['2v2'].matches).toBe(0)
  })

  it('two calls for one game at once: the second changes nothing and does not throw', async () => {
    await db
      .insertInto('user')
      .values(['kai', 'max'].map(id => ({ id, name: id, email: `${id}@x`, emailVerified: false, image: null })))
      .execute()
    await db
      .insertInto('ranked_ratings')
      .values(['kai', 'max'].map(user_id => ({ user_id, mode: '1v1' as const, rating: 1200 })))
      .execute()
    const g = await game()
    const record = () => recordRankedResult(db, { sessionId: g, mode: '1v1', at: at(10), sides: duel('kai', 'max', 60, 50) })
    // Hold the rating rows so both calls get as far as they can before either writes
    let release = () => {}
    const holding = db.transaction().execute(async trx => {
      await trx.selectFrom('ranked_ratings').select('user_id').where('user_id', 'in', ['kai', 'max']).forUpdate().execute()
      await new Promise<void>(r => (release = r))
    })
    const both = Promise.all([record(), record()])
    const waiting = async () =>
      Number(
        (
          await sql<{ n: string }>`SELECT count(*) AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%ranked%'`.execute(db)
        ).rows[0].n,
      )
    while ((await waiting()) < 2) await new Promise(r => setTimeout(r, 10))
    release()
    await holding
    await both
    expect((await getRatings(db, 'kai'))['1v1']).toMatchObject({ rating: 1227, matches: 1 })
  })

  it('gets a rank after the fifth game; after that only the result counts', async () => {
    for (let i = 0; i < 4; i++) {
      await recordRankedResult(db, { sessionId: await game(), mode: '1v1', at: at(11 + i), sides: duel('chris', 'ben', 70, null) })
    }
    const placed = (await getRatings(db, 'chris'))['1v1']
    expect(placed.matches).toBe(5)
    expect(placed.streak).toBe(5)
    expect(placed.rankIndex).toBe(rankIndexFor(placed.rating))
    expect(await onlineAverage(db, 'chris')).toBe(68)

    const ben = (await getRatings(db, 'ben'))['1v1'].rating
    await recordRankedResult(db, { sessionId: await game(), mode: '1v1', at: at(16), sides: duel('chris', 'ben', 20, 90) })
    const e = 1 / (1 + 10 ** ((ben - placed.rating) / 400))
    expect((await getRatings(db, 'chris'))['1v1'].rating).toBe(placed.rating + Math.max(1, Math.round(32 * (1 - e))))
  })

  it('a duo is rated on its average and both move by the same RP', async () => {
    await recordRankedResult(db, {
      sessionId: await game(),
      mode: '2v2',
      at: at(20),
      sides: [
        {
          won: false,
          players: [
            { userId: 'chris', average: null },
            { userId: 'lena', average: null },
          ],
        },
        {
          won: true,
          players: [
            { userId: 'anna', average: null },
            { userId: 'ben', average: null },
          ],
        },
      ],
    })
    expect((await getRatings(db, 'chris'))['2v2'].rating).toBe(1168)
    expect((await getRatings(db, 'lena'))['2v2'].rating).toBe(1168)
    expect((await getRatings(db, 'anna'))['2v2'].rating).toBe(1232)
  })

  it('recent games hide placement changes and ratings, and so does the 30-day change', async () => {
    const recent = await recentRanked(db, 'chris', 3)
    expect(recent).toHaveLength(3)
    expect(recent[0]).toMatchObject({ mode: '2v2', won: false, change: null })
    expect(recent[0].opponents).toEqual([
      { userId: 'anna', name: 'Anna', rating: null, avatar: defaultAvatar },
      { userId: 'ben', name: 'Ben', rating: null, avatar: defaultAvatar },
    ])
    expect(recent[1]).toMatchObject({ mode: '1v1', won: true })
    expect(recent[1].change).toBeGreaterThan(0)
    expect(recent[1].opponents.map(o => o.name)).toEqual(['Ben'])
    expect(recent[1].opponents[0].rating).toBeNull() // Ben was still placing
    expect(recent[2].change).toBeNull()
    const change = await ratingChangeSince(db, 'chris', at(1))
    expect(change['2v2']).toBe(0)
    expect(change['1v1']).toBe(recent[1].change)
  })
  describe('recalculateRatings', () => {
    // Four games between three players, played in order; the same games again without the second one for a twin trio
    const script: [string, string, number][] = [
      ['sam', 'tim', 21],
      ['ruth', 'sam', 22],
      ['ruth', 'tim', 23],
      ['sam', 'ruth', 24],
    ]
    const twin = (id: string) => `${id}2`
    const ids: string[] = []
    const snapshot = (users: string[]) => Promise.all(users.map(async u => (await getRatings(db, u))['1v1']))

    beforeAll(async () => {
      for (const [winner, loser, day] of script) {
        const sessionId = await game()
        ids.push(sessionId)
        await recordRankedResult(db, { sessionId, mode: '1v1', at: at(day), sides: duel(winner, loser, 60, 40) })
      }
      // The twins never played the second game
      for (const [winner, loser, day] of script.filter((_, i) => i !== 1)) {
        await recordRankedResult(db, { sessionId: await game(), mode: '1v1', at: at(day), sides: duel(twin(winner), twin(loser), 60, 40) })
      }
    })

    it('changes nothing when no game is excluded', async () => {
      const before = await snapshot(['sam', 'tim', 'ruth'])
      const results = await db
        .selectFrom('ranked_results')
        .selectAll()
        .where('session_id', 'in', ids)
        .orderBy('session_id')
        .orderBy('user_id')
        .execute()
      await recalculateRatings(db, '1v1')
      expect(await snapshot(['sam', 'tim', 'ruth'])).toEqual(before)
      expect(
        await db.selectFrom('ranked_results').selectAll().where('session_id', 'in', ids).orderBy('session_id').orderBy('user_id').execute(),
      ).toEqual(results)
    })

    it('rates the later games as if an excluded one was never played', async () => {
      await recalculateRatings(db, '1v1', new Set([ids[1] ?? '']))
      const [sam, tim, ruth] = await snapshot(['sam', 'tim', 'ruth'])
      const [sam2, tim2, ruth2] = await snapshot(['sam2', 'tim2', 'ruth2'])
      expect(sam).toEqual(sam2)
      expect(tim).toEqual(tim2)
      expect(ruth).toEqual(ruth2)
      expect(sam.matches).toBe(2)
      // The twin trio's rating_before/after per game match too
      const rowsOf = (u: string) =>
        db
          .selectFrom('ranked_results')
          .select(['rating_before', 'rating_after', 'placement'])
          .where('user_id', '=', u)
          .where('session_id', '!=', ids[1] ?? '')
          .orderBy('created_at')
          .execute()
      expect(await rowsOf('ruth')).toEqual(await rowsOf('ruth2'))
      // The excluded game keeps its own row, untouched (a deleted game's rows are gone with it)
      expect(
        await db
          .selectFrom('ranked_results')
          .select('user_id')
          .where('session_id', '=', ids[1] ?? '')
          .execute(),
      ).toHaveLength(2)
    })

    it('drops the rating of a player whose only game is gone, and recounts the others', async () => {
      const only = await game()
      await recordRankedResult(db, { sessionId: only, mode: '1v1', at: at(25), sides: duel('zoe', 'yan', 50, 50) })
      expect((await getRatings(db, 'yan'))['1v1'].matches).toBe(1)
      await db.deleteFrom('game_sessions').where('id', '=', only).execute()
      await recalculateRatings(db, '1v1')
      expect(await db.selectFrom('ranked_ratings').select('user_id').where('user_id', 'in', ['zoe', 'yan']).execute()).toEqual([])
      // Back to a new player: the next game seeds them again
      expect((await getRatings(db, 'zoe'))['1v1']).toMatchObject({ rating: 1200, matches: 0, rankIndex: null })
    })

    it("keeps a survivor's recorded change when the opponent's account is gone", async () => {
      await recordRankedResult(db, { sessionId: await game(), mode: '1v1', at: at(26), sides: duel('eli', 'liv', 60, 40) })
      const recorded = (await getRatings(db, 'eli'))['1v1']
      await db.deleteFrom('user').where('id', '=', 'liv').execute()
      await recalculateRatings(db, '1v1')
      expect((await getRatings(db, 'eli'))['1v1']).toEqual(recorded)
    })
  })
})
