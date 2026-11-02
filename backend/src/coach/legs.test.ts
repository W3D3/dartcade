import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertGameSession, finishGameSession } from '../db/queries.js'
import { invalidateGame } from '../db/adminGames.js'
import type { LegReview } from '../shared/coach/review.js'
import { COACH_VERSION } from './store.js'
import { coachLegsSummary, coachLegsPage, getCoachLeg } from './legs.js'
import { decodeCoachCursor, encodeCoachCursor } from './cursor.js'

const review = (o: Partial<LegReview> = {}): LegReview => ({
  leg: 0,
  seat: 0,
  won: true,
  darts: 9,
  average: 45,
  visits: [],
  skills: { scoring: { grade: null, line: '–' }, setup: { grade: null, line: '–' }, doubling: { grade: null, line: '–' } },
  take: 'Won in 9 darts.',
  counts: { lowVisits: 0, badSetups: 0, missedDoubles: 0, clean: true },
  ...o,
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('coach legs reads', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let seq = 0

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('coach_legs_reads'))
    await db
      .insertInto('user')
      .values([
        { id: 'ann', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null },
        { id: 'bob', name: 'Bob', email: 'bob@example.com', emailVerified: true, image: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })
  afterEach(async () => {
    await sql`TRUNCATE game_sessions CASCADE`.execute(db)
  })

  /** A finished two-seat game (ann + a guest) coach_legs rows can reference by FK. */
  async function makeGame(finishedAt: Date, opponentName = 'Bob'): Promise<string> {
    const id = `g${++seq}`
    await insertGameSession(db, {
      id,
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [
        { name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null },
        { name: opponentName, user_id: null, controller_user_id: 'ann', board_db_id: null, bot_level: null },
      ],
    })
    await finishGameSession(db, id, finishedAt, [
      { placement: 1, stats: {}, throwPosition: 0, forfeited: false },
      { placement: 2, stats: {}, throwPosition: 1, forfeited: false },
    ])
    return id
  }

  type LegFields = Partial<{
    won: boolean
    ranked: boolean
    darts: number
    average: number | null
    lowVisits: number
    badSetups: number
    missedDoubles: number
    clean: boolean
    opponents: string[]
    context: string
    winnerName: string | null
    winnerDarts: number | null
  }>

  async function addLeg(gameId: string, leg: number, userId: string, seat: number, finishedAt: Date, f: LegFields = {}) {
    const won = f.won ?? true
    const lowVisits = f.lowVisits ?? 0
    const badSetups = f.badSetups ?? 0
    const missedDoubles = f.missedDoubles ?? 0
    const clean = f.clean ?? true
    const opponents = f.opponents ?? ['Bob']
    await db
      .insertInto('coach_legs')
      .values({
        user_id: userId,
        game_id: gameId,
        leg,
        seat,
        finished_at: finishedAt,
        won,
        ranked: f.ranked ?? false,
        darts: f.darts ?? 9,
        average: f.average ?? 45,
        low_visits: lowVisits,
        bad_setups: badSetups,
        missed_doubles: missedDoubles,
        clean,
        opponents: JSON.stringify(opponents),
        context: f.context ?? `501 · leg ${leg + 1}`,
        review: JSON.stringify(review({ leg, seat, won, darts: f.darts ?? 9, counts: { lowVisits, badSetups, missedDoubles, clean } })),
        winner_name: f.winnerName ?? null,
        winner_darts: f.winnerDarts ?? null,
        version: COACH_VERSION,
      })
      .execute()
  }

  it("counts legs, lowVisits, badSetups, missedDoubles and cleanLegs over the user's rows, and reports the newest finished_at", async () => {
    const g1 = await makeGame(new Date('2026-10-01T00:00:00Z'))
    const g2 = await makeGame(new Date('2026-10-02T00:00:00Z'))
    await addLeg(g1, 0, 'ann', 0, new Date('2026-10-01T00:00:00Z'), { lowVisits: 1, badSetups: 2, clean: false })
    await addLeg(g2, 0, 'ann', 0, new Date('2026-10-02T00:00:00Z'), { missedDoubles: 3, clean: true })
    expect(await coachLegsSummary(db, 'ann')).toEqual({
      counts: { legs: 2, lowVisits: 1, badSetups: 2, missedDoubles: 3, cleanLegs: 1 },
      updatedAt: new Date('2026-10-02T00:00:00Z'),
    })
  })

  it('reports no counts and a null updatedAt for a user with no stored legs', async () => {
    expect(await coachLegsSummary(db, 'ann')).toEqual({
      counts: { legs: 0, lowVisits: 0, badSetups: 0, missedDoubles: 0, cleanLegs: 0 },
      updatedAt: null,
    })
  })

  it('counts only the 50 most recent legs, dropping older ones', async () => {
    for (let i = 0; i < 51; i++) {
      const g = await makeGame(new Date(Date.UTC(2026, 0, i + 1)))
      // The oldest leg (i === 0) carries a distinct marker that must not reach the sum
      await addLeg(g, 0, 'ann', 0, new Date(Date.UTC(2026, 0, i + 1)), { lowVisits: i === 0 ? 100 : 0 })
    }
    const { counts } = await coachLegsSummary(db, 'ann')
    expect(counts.legs).toBe(50)
    expect(counts.lowVisits).toBe(0)
  })

  it('excludes an invalidated game from the counts', async () => {
    const g1 = await makeGame(new Date('2026-10-01T00:00:00Z'))
    await addLeg(g1, 0, 'ann', 0, new Date('2026-10-01T00:00:00Z'), { lowVisits: 5 })
    await invalidateGame(db, g1, 'ann', null)
    expect(await coachLegsSummary(db, 'ann')).toEqual({
      counts: { legs: 0, lowVisits: 0, badSetups: 0, missedDoubles: 0, cleanLegs: 0 },
      updatedAt: null,
    })
  })

  it('filters the paged list without changing the counts', async () => {
    const t = (i: number) => new Date(Date.UTC(2026, 0, i + 1))
    const lost = await makeGame(t(0))
    const ranked = await makeGame(t(1))
    const doubles = await makeGame(t(2))
    const setups = await makeGame(t(3))
    const visits = await makeGame(t(4))
    const clean = await makeGame(t(5))
    await addLeg(lost, 0, 'ann', 0, t(0), { won: false })
    await addLeg(ranked, 0, 'ann', 0, t(1), { ranked: true })
    await addLeg(doubles, 0, 'ann', 0, t(2), { missedDoubles: 2 })
    await addLeg(setups, 0, 'ann', 0, t(3), { badSetups: 1 })
    await addLeg(visits, 0, 'ann', 0, t(4), { lowVisits: 1 })
    await addLeg(clean, 0, 'ann', 0, t(5))

    const gamesOf = async (filter: Parameters<typeof coachLegsPage>[2]) =>
      (await coachLegsPage(db, 'ann', filter, null)).rows.map(r => r.gameId)
    expect(new Set(await gamesOf('all'))).toEqual(new Set([lost, ranked, doubles, setups, visits, clean]))
    expect(await gamesOf('lost')).toEqual([lost])
    expect(await gamesOf('ranked')).toEqual([ranked])
    expect(await gamesOf('missedDoubles')).toEqual([doubles])
    expect(await gamesOf('badSetups')).toEqual([setups])
    expect(await gamesOf('lowVisits')).toEqual([visits])

    // The filter never changes the counts strip
    const { counts } = await coachLegsSummary(db, 'ann')
    expect(counts.legs).toBe(6)
  })

  it('pages by 40 with a stable newest-first cursor, and excludes an invalidated game', async () => {
    const t = (i: number) => new Date(Date.UTC(2026, 0, i + 1))
    const ids: string[] = []
    for (let i = 0; i < 45; i++) {
      const g = await makeGame(t(i))
      await addLeg(g, 0, 'ann', 0, t(i))
      ids.push(g)
    }
    await invalidateGame(db, ids[44], 'ann', null)
    const newestFirst = [...ids.slice(0, 44)].reverse()

    const first = await coachLegsPage(db, 'ann', 'all', null)
    expect(first.rows).toHaveLength(40)
    expect(first.rows.map(r => r.gameId)).toEqual(newestFirst.slice(0, 40))
    expect(first.next).not.toBeNull()

    const cursor = encodeCoachCursor(first.next!)
    expect(decodeCoachCursor(cursor)).toEqual(first.next)
    const second = await coachLegsPage(db, 'ann', 'all', decodeCoachCursor(cursor))
    expect(second.rows.map(r => r.gameId)).toEqual(newestFirst.slice(40))
    expect(second.next).toBeNull()
  })

  it('breaks ties within the same finished_at by game and leg, newest first', async () => {
    const same = new Date('2026-10-01T00:00:00Z')
    const gA = await makeGame(same)
    const gB = await makeGame(same)
    const low = gA < gB ? gA : gB
    const high = gA < gB ? gB : gA
    await addLeg(low, 0, 'ann', 0, same)
    await addLeg(low, 1, 'ann', 0, same)
    await addLeg(high, 0, 'ann', 0, same)
    const page = await coachLegsPage(db, 'ann', 'all', null)
    expect(page.rows.map(r => [r.gameId, r.leg])).toEqual([
      [high, 0],
      [low, 1],
      [low, 0],
    ])
  })

  it("returns the user's own leg with its stored winner, null for another user's leg, and null once it's gone", async () => {
    const g = await makeGame(new Date('2026-10-01T00:00:00Z'))
    await addLeg(g, 0, 'ann', 0, new Date('2026-10-01T00:00:00Z'), { won: false, winnerName: 'Carol', winnerDarts: 11 })

    const mine = await getCoachLeg(db, 'ann', g, 0)
    expect(mine).toMatchObject({ won: false, context: '501 · leg 1', winnerName: 'Carol', winnerDarts: 11 })
    expect(await getCoachLeg(db, 'bob', g, 0)).toBeNull()
    expect(await getCoachLeg(db, 'ann', g, 1)).toBeNull()
    expect(await getCoachLeg(db, 'ann', 'no-such-game', 0)).toBeNull()
  })

  it('has a null winner for a leg the round limit cut short', async () => {
    const g = await makeGame(new Date('2026-10-01T00:00:00Z'))
    await addLeg(g, 0, 'ann', 0, new Date('2026-10-01T00:00:00Z'), { won: false })
    const mine = await getCoachLeg(db, 'ann', g, 0)
    expect(mine).toMatchObject({ winnerName: null, winnerDarts: null })
  })

  it('excludes a leg once its game is invalidated', async () => {
    const g = await makeGame(new Date('2026-10-01T00:00:00Z'))
    await addLeg(g, 0, 'ann', 0, new Date('2026-10-01T00:00:00Z'))
    await invalidateGame(db, g, 'ann', null)
    expect(await getCoachLeg(db, 'ann', g, 0)).toBeNull()
  })
})
