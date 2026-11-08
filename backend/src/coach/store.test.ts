import { signInAs } from '../test/authAs.js'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { getFinishedGame, type HistoryGame } from '../db/history.js'
import { invalidateGame } from '../db/adminGames.js'
import { finishGameSession, insertGameSession } from '../db/queries.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import type { Seat } from '../session/types.js'
import { games } from '../games/index.js'
import { pointFor } from '../bots/accuracy.js'
import { segmentAt } from '../shared/board.js'
import { createFastify } from '../api/fastify.js'
import { coachApiPlugin } from '../api/coach.js'
import { backfillCoachLegs, buildCoachLegs, COACH_VERSION, ensureCoachGame, ensureCoachLegs, pendingCoachGames } from './store.js'
import { coachLegsPage, coachLegsSummary, getCoachLeg } from './legs.js'
import { insertLobby, insertUsers } from '../test/fixtures.js'

signInAs('ann')
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn(() => Promise.resolve(true)), loadFlagUser: vi.fn(() => Promise.resolve(null)) }))

const fail = (msg: string, details: unknown) => {
  throw new Error(`${msg} ${JSON.stringify(details)}`)
}

// Ann checks out 301 in her second visit; Bob and a guest throw one visit each
const SCRIPT = [
  [
    ['T20', 'T20', 'T20'],
    ['T20', 'S11', 'Bull'],
  ],
  [['S1', 'S1', 'S1']],
  [['S5', 'S5', 'S5']],
]

describe.skipIf(!process.env.TEST_DATABASE_URL)('coach_legs', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let engine: SessionEngine

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('coach_store'))
    await insertUsers(db, [
      { id: 'ann', emailVerified: true },
      { id: 'bob', emailVerified: true },
    ])
    engine = new SessionEngine(createEngineStore(db), () => undefined)
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    await sql`TRUNCATE game_sessions CASCADE`.execute(db)
  })

  /** Plays a script (per seat, per visit, dart labels) to the end. */
  async function playWith(seats: Seat[], script: string[][][], config: object = {}): Promise<HistoryGame> {
    const mod = games.x01!
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: seats[0].userId ?? 'ann',
      gameId: 'x01',
      config: { ...mod.defaultConfig, startScore: 301, firstTo: 1, ...config },
      seats,
    })
    const session = engine.getSession(sessionId)!
    const visits = seats.map(() => 0)
    while (session.status === 'active') {
      const up = session.module.getCurrentPlayer(session.currentState)
      const thrown = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
      const darts = script[up][visits[up]]
      const action =
        thrown < darts.length
          ? {
              type: 'add_dart' as const,
              segment: segmentAt(pointFor(darts[thrown]).x, pointFor(darts[thrown]).y),
              coords: pointFor(darts[thrown]),
            }
          : { type: 'takeout' as const }
      if (action.type === 'takeout') visits[up]++
      const result = await engine.onUserAction(sessionId, seats[up].controllerUserId, action)
      if (!result.ok) throw new Error(result.code)
    }
    return (await getFinishedGame(db, sessionId))!
  }

  const DEFAULT_SEATS: Seat[] = [
    { name: 'Ann', userId: 'ann', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
    { name: 'Bob', userId: 'bob', controllerUserId: 'bob', boardId: null, boardName: null, bot: null },
    { name: 'Guest', userId: null, controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
  ]

  /** Plays SCRIPT to the end: Ann, Bob and a guest, in that order. */
  async function play(config: object = {}): Promise<HistoryGame> {
    return playWith(DEFAULT_SEATS, SCRIPT, config)
  }

  const rows = () => db.selectFrom('coach_legs').selectAll().orderBy('seat').execute()
  /** What a COACH_VERSION bump leaves behind: every game built, and its rows, by the version before. */
  async function staleAll(set: { darts?: number; review?: string } = {}) {
    await db
      .updateTable('coach_games')
      .set({ version: COACH_VERSION - 1 })
      .execute()
    if (Object.keys(set).length) await db.updateTable('coach_legs').set(set).execute()
  }

  it('stores a row per leg for each seat with an account', async () => {
    const game = await play()
    await buildCoachLegs(db, game, fail)
    const stored = await rows()
    expect(stored.map(r => [r.user_id, r.leg, r.seat, r.won, r.darts])).toEqual([
      ['ann', 0, 0, true, 6],
      ['bob', 0, 1, false, 3],
    ])
    const [ann, bob] = stored
    expect(ann).toMatchObject({
      game_id: game.id,
      finished_at: game.finished_at,
      ranked: false,
      opponents: ['Bob', 'Guest'],
      context: '301 · leg 1',
      clean: ann.review.counts.clean,
      low_visits: ann.review.counts.lowVisits,
      winner_name: 'Ann',
      winner_darts: 6,
    })
    expect(ann.review).toMatchObject({ leg: 0, seat: 0, won: true, darts: 6 })
    expect(ann.review.visits).toHaveLength(2)
    expect(ann.average).toBeCloseTo(ann.review.average!, 3)
    // Bob lost, but the leg's winner is the same for every seat's row
    expect(bob).toMatchObject({ winner_name: 'Ann', winner_darts: 6 })
  })

  it('stores the user themself as the winner, with their own darts, in a 1v1 leg they won', async () => {
    const seats: Seat[] = [
      { name: 'Ann', userId: 'ann', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
      { name: 'Bob', userId: 'bob', controllerUserId: 'bob', boardId: null, boardName: null, bot: null },
    ]
    const game = await playWith(seats, SCRIPT.slice(0, 2), {})
    await buildCoachLegs(db, game, fail)
    const stored = await rows()
    expect(stored.map(r => [r.user_id, r.won, r.winner_name, r.winner_darts])).toEqual([
      ['ann', true, 'Ann', 6],
      ['bob', false, 'Ann', 6],
    ])
  })

  it("stores the winner and their darts, even when the winner isn't coached (no account)", async () => {
    const seats: Seat[] = [
      { name: 'Ann', userId: 'ann', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
      { name: 'Bob', userId: 'bob', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
      { name: 'Guest', userId: null, controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
    ]
    // Ann and Bob each throw a visit that doesn't open the leg; the guest checks out 41 in 2 darts
    const script = [[['S1', 'S1', 'S1']], [['S1', 'S1', 'S1']], [['S1', 'D20']]]
    const game = await playWith(seats, script, { startScore: 41 })
    await buildCoachLegs(db, game, fail)
    const stored = await rows()
    // Only Ann and Bob have accounts; the guest (the actual winner) gets no row of their own
    expect(stored.map(r => [r.user_id, r.seat, r.won, r.winner_name, r.winner_darts])).toEqual([
      ['ann', 0, false, 'Guest', 2],
      ['bob', 1, false, 'Guest', 2],
    ])
  })

  it('stores a null winner for a leg the round limit cut short (nobody checked out)', async () => {
    const seats: Seat[] = [
      { name: 'Ann', userId: 'ann', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
      { name: 'Bob', userId: 'bob', controllerUserId: 'bob', boardId: null, boardName: null, bot: null },
    ]
    // One visit each, well short of 301; the single-round limit ends the match before either opens a leg
    const script = [[['S1', 'S1', 'S1']], [['S1', 'S1', 'S1']]]
    const game = await playWith(seats, script, { maxRounds: 1 })
    await buildCoachLegs(db, game, fail)
    const stored = await rows()
    expect(stored.map(r => [r.user_id, r.won, r.winner_name, r.winner_darts])).toEqual([
      ['ann', false, null, null],
      ['bob', false, null, null],
    ])
  })

  it('names the lobby or the ranked mode in the context', async () => {
    const game = await play()
    await insertLobby(db, { id: 'l1', name: 'Friday darts', host_user_id: 'ann', code: 'ABCDEF', next_game: '{}' })
    await db.updateTable('game_sessions').set({ lobby_id: 'l1' }).where('id', '=', game.id).execute()
    await buildCoachLegs(db, game, fail)
    expect((await rows())[0].context).toBe('301 · Friday darts · leg 1')

    await db
      .insertInto('ranked_matches')
      .values({ session_id: game.id, mode: '1v1', sides: JSON.stringify([['ann'], ['bob']]) })
      .execute()
    await buildCoachLegs(db, game, fail)
    expect((await rows())[0]).toMatchObject({ context: 'Ranked 1v1 · leg 1', ranked: true })
  })

  it('builds missing rows and rebuilds those of another version', async () => {
    await play()
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(1)
    expect(await rows()).toHaveLength(2)
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)

    await staleAll({ darts: 99 })
    expect(await ensureCoachLegs(db, 'bob', fail)).toBe(1)
    expect((await rows()).map(r => r.darts)).toEqual([6, 3])
    expect(await ensureCoachLegs(db, 'bob', fail)).toBe(0)
  })

  it('leaves a game a newer version built alone', async () => {
    const game = await play()
    await buildCoachLegs(db, game, fail)
    await db
      .updateTable('coach_games')
      .set({ version: COACH_VERSION + 1 })
      .execute()
    await db.updateTable('coach_legs').set({ darts: 99 }).execute()
    await buildCoachLegs(db, game, fail)
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)
    expect((await rows()).map(r => r.darts)).toEqual([99, 99])
    expect(await db.selectFrom('coach_games').select('version').execute()).toEqual([{ version: COACH_VERSION + 1 }])
  })

  it('marks a game that gave no rows as built, so it is not replayed again', async () => {
    const seats: Seat[] = [
      { name: 'Guest', userId: null, controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
      { name: 'Ann', userId: 'ann', controllerUserId: 'ann', boardId: null, boardName: null, bot: null },
    ]
    // The guest checks out 41 before Ann throws a dart
    const game = await playWith(seats, [[['S1', 'D20']], [['S1']]], { startScore: 41 })
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(1)
    expect(await rows()).toEqual([])
    expect(await db.selectFrom('coach_games').select(['game_id', 'version']).execute()).toEqual([
      { game_id: game.id, version: COACH_VERSION },
    ])
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)
    await backfillCoachLegs(db, fail)
    const before = await db.selectFrom('coach_games').select('built_at').executeTakeFirstOrThrow()
    await ensureCoachGame(db, 'ann', game.id, fail)
    expect(await db.selectFrom('coach_games').select('built_at').executeTakeFirstOrThrow()).toEqual(before)
  })

  it('serves no row of an older version, in the list, the counts or the detail', async () => {
    const game = await play()
    await buildCoachLegs(db, game, fail)
    await staleAll()
    expect((await coachLegsPage(db, 'ann', 'all', null)).rows).toEqual([])
    expect((await coachLegsSummary(db, 'ann')).counts.legs).toBe(0)
    expect(await getCoachLeg(db, 'ann', game.id, 0)).toBeNull()
  })

  it('rebuilds a stale leg on request: an older version is missing, not served', async () => {
    const game = await play()
    await buildCoachLegs(db, game, fail)
    // A review of the version before the dart classes
    const [ann] = await rows()
    const old = { ...ann.review, visits: ann.review.visits.map(v => ({ ...v, darts: v.darts.map(({ class: _, ...d }) => d) })) }
    await staleAll({ review: JSON.stringify(old) })

    const app = createFastify()
    app.register(coachApiPlugin, { db })
    const res = await app.inject({ method: 'GET', url: `/api/coach/legs/${game.id}/0` })
    expect(res.statusCode).toBe(200)
    expect(res.json().review.visits[0].darts[0].class).toMatchObject({ kind: 'scoringHit' })
    expect(await rows()).toHaveLength(2)
    expect(await db.selectFrom('coach_games').select('version').execute()).toEqual([{ version: COACH_VERSION }])
  })

  it('builds at most max games per call, newest first', async () => {
    const first = await play()
    const second = await play()
    expect(await ensureCoachLegs(db, 'ann', fail, 1)).toBe(1)
    expect(new Set((await rows()).map(r => r.game_id))).toEqual(new Set([second.id]))
    expect(await ensureCoachLegs(db, 'ann', fail, 1)).toBe(1)
    expect(new Set((await rows()).map(r => r.game_id))).toEqual(new Set([first.id, second.id]))
  })

  it("counts the user's recent games still waiting for a review", async () => {
    await play()
    await play()
    expect(await pendingCoachGames(db, 'ann')).toBe(2)
    await ensureCoachLegs(db, 'ann', fail, 1)
    expect(await pendingCoachGames(db, 'ann')).toBe(1)
    await ensureCoachLegs(db, 'ann', fail)
    expect(await pendingCoachGames(db, 'ann')).toBe(0)
  })

  it('skips invalidated games', async () => {
    const game = await play()
    await invalidateGame(db, game.id, 'ann', null)
    const invalidated = (await getFinishedGame(db, game.id))!
    await buildCoachLegs(db, invalidated, fail)
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)
    await backfillCoachLegs(db, fail)
    expect(await rows()).toEqual([])
  })

  it('stores nothing for games the coach does not review', async () => {
    const straight = await play({ outMode: 'straight' })
    await buildCoachLegs(db, straight, fail)
    await buildCoachLegs(db, { ...straight, config: { ...straight.config, outMode: 'double', format: 'teams', teams: [0, 1, 0] } }, fail)
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)
    await backfillCoachLegs(db, fail)
    expect(await rows()).toEqual([])
  })

  it('backfills every game with missing rows, the same games as buildCoachLegs reviews', async () => {
    const a = await play()
    const b = await play()
    const bull50 = await play({ bullValue: '50_50' })
    await backfillCoachLegs(db, fail)
    expect(new Set((await rows()).map(r => r.game_id))).toEqual(new Set([a.id, b.id]))
    expect(await rows()).toHaveLength(4)
    await buildCoachLegs(db, bull50, fail)
    expect(await rows()).toHaveLength(4)
  })

  it("builds one game on request, only the user's own, finished and valid", async () => {
    const game = await play()
    await ensureCoachGame(db, 'nobody', game.id, fail)
    expect(await rows()).toEqual([])
    await ensureCoachGame(db, 'ann', 'no-such-game', fail)
    expect(await rows()).toEqual([])
    await ensureCoachGame(db, 'bob', game.id, fail)
    expect((await rows()).map(r => [r.user_id, r.game_id])).toEqual([
      ['ann', game.id],
      ['bob', game.id],
    ])

    const invalid = await play()
    await invalidateGame(db, invalid.id, 'ann', null)
    await ensureCoachGame(db, 'ann', invalid.id, fail)
    expect((await rows()).map(r => r.game_id)).not.toContain(invalid.id)
  })

  it('builds a game once when builds overlap', async () => {
    const game = await play()
    await Promise.all([...Array.from({ length: 5 }, () => buildCoachLegs(db, game, fail)), ensureCoachLegs(db, 'ann', fail)])
    expect((await rows()).map(r => [r.user_id, r.darts])).toEqual([
      ['ann', 6],
      ['bob', 3],
    ])
    expect(await db.selectFrom('coach_games').select('game_id').execute()).toEqual([{ game_id: game.id }])
  })

  it('warns once about a game that fails, records nothing for it and builds the others', async () => {
    const older = await play()
    const broken = await play()
    // A detail the coach can't read, stored by the current detail code so it isn't rebuilt
    await buildCoachLegs(db, broken, fail)
    await db.updateTable('game_details').set({ detail: '{"mode":"x01","legs":5}' }).where('session_id', '=', broken.id).execute()
    await db.deleteFrom('coach_legs').execute()
    await db.deleteFrom('coach_games').execute()

    const warn = vi.fn()
    expect(await ensureCoachLegs(db, 'ann', warn)).toBe(2)
    expect(warn).toHaveBeenCalledWith('coach build failed', expect.objectContaining({ id: broken.id }))
    expect(new Set((await rows()).map(r => r.game_id))).toEqual(new Set([older.id]))
    expect(await db.selectFrom('coach_games').select('game_id').execute()).toEqual([{ game_id: older.id }])

    // Skipped from then on (until a restart), so it doesn't take a slot of every request's cap
    expect(await ensureCoachLegs(db, 'ann', warn)).toBe(0)
    await backfillCoachLegs(db, warn)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('grades each player for their own target, and regrades their legs, only theirs, when they pick another', async () => {
    const setTarget = (id: string, target: string) =>
      db
        .updateTable('user')
        .set({ preferences: sql`jsonb_build_object('coachTarget', ${target}::text)` })
        .where('id', '=', id)
        .execute()
    await setTarget('bob', 'beginner')
    const game = await play()
    await buildCoachLegs(db, game, fail)
    expect((await rows()).map(r => [r.target, r.review.coachTier])).toEqual([
      ['auto', expect.any(String)],
      ['beginner', 'beginner'],
    ])
    expect(await pendingCoachGames(db, 'ann')).toBe(0)

    await setTarget('ann', 'worldclass')
    // Ann's legs are stale until the game is rebuilt: hidden, waiting, rebuilt on request
    expect((await coachLegsPage(db, 'ann', 'all', null)).rows).toEqual([])
    expect(await getCoachLeg(db, 'ann', game.id, 0)).toBeNull()
    expect(await pendingCoachGames(db, 'ann')).toBe(1)
    expect(await pendingCoachGames(db, 'bob')).toBe(0)
    expect((await coachLegsPage(db, 'bob', 'all', null)).rows).toHaveLength(1)
    await ensureCoachGame(db, 'ann', game.id, fail)
    expect((await rows()).map(r => [r.target, r.review.coachTier])).toEqual([
      ['worldclass', 'worldclass'],
      ['beginner', 'beginner'],
    ])
    expect((await getCoachLeg(db, 'ann', game.id, 0))?.review.coachTier).toBe('worldclass')

    // Back to auto: the list's build picks it up
    await setTarget('ann', 'auto')
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(1)
    expect((await rows())[0].target).toBe('auto')
    expect(await ensureCoachLegs(db, 'ann', fail)).toBe(0)
  })

  it("grades against the average when the game finished, not today's", async () => {
    const game = await play()
    await buildCoachLegs(db, game, fail)
    const before = (await rows())[0].review

    // A much weaker game Ann finished later
    await insertGameSession(db, {
      id: 'later',
      owner_user_id: 'ann',
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config: games.x01!.defaultConfig,
      players: [{ name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, bot_level: null }],
    })
    await finishGameSession(db, 'later', new Date(), [
      { placement: 1, stats: { average: 5, dartsThrown: 300 }, throwPosition: 0, forfeited: false },
    ])
    await staleAll()
    await ensureCoachLegs(db, 'ann', fail)
    expect((await rows())[0].review).toEqual(before)
  })
})
