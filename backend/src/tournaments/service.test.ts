import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { registerSolo, withdrawSolo } from '../db/tournaments.js'
import { checkIn, seesTournamentOfMatch } from '../db/tournamentRun.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import { currentSeat } from '../session/access.js'
import type { Segment } from '../session/types.js'
import type { TournamentCheckInMessage, TournamentDroppedMessage, TournamentMatchMessage } from '../schema/lobby-ws.js'
import { insertTournament, insertUsers } from '../test/fixtures.js'
import { TournamentService } from './service.js'
import { liveMessage } from './live.js'

const MIN = 60_000
const seg = (name: string, number: number, bed: Segment['bed'], multiplier: Segment['multiplier']): Segment => ({
  name,
  number,
  bed,
  multiplier,
})
const T20 = seg('T20', 20, 'Triple', 3)
const T17 = seg('T17', 17, 'Triple', 3)
const D5 = seg('D5', 5, 'Double', 2)
const S1 = seg('S1', 1, 'SingleInner', 1)
const BULL = seg('Bull', 50, 'Double', 2)
const S20 = seg('S20', 20, 'SingleInner', 1)

const settings = (over: object = {}) =>
  JSON.stringify({
    seeding: 'rating',
    firstTo: 1,
    longerFinal: { firstTo: 2, semis: false },
    groups: null,
    registrationClosesMinutes: 30,
    checkInMinutes: 30,
    plannedFor: null,
    manualScoring: true,
    noShowMinutes: 10,
    avgLimit: null,
    ...over,
  })

describe.skipIf(!process.env.TEST_DATABASE_URL)('TournamentService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let now: number
  let online: Set<string>
  let sent: [string, TournamentCheckInMessage | TournamentDroppedMessage | TournamentMatchMessage][]
  let engine: SessionEngine
  let service: TournamentService
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']

  /** A fresh engine (rebuilt from the database, as at a server start) and service. */
  async function boot(): Promise<void> {
    engine = new SessionEngine(
      createEngineStore(db),
      () => {},
      () => {},
      undefined,
      e => service.onGameEnded(e),
    )
    service = new TournamentService({
      db,
      engine,
      isOnline: u => online.has(u),
      send: (u, m) => sent.push([u, m]),
      now: () => now,
      warn: () => {},
    })
    await engine.rebuild()
  }

  const matches = (tournamentId: string) =>
    db.selectFrom('tournament_matches').selectAll().where('tournament_id', '=', tournamentId).orderBy('round').orderBy('slot').execute()
  const tournament = (id: string) => db.selectFrom('tournaments').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  const gameOf = (userId: string) => {
    const s = engine.getSessionByUser(userId)
    if (!s) throw new Error(`${userId} has no game`)
    return s.id
  }

  /**
   * Plays a 301 game by hand to its end: `winner` wins the bull off and every leg with 180 then
   * T20 T17 D5, the other side throws S1 S1 S1. Stops early once `until` holds.
   */
  async function play(sessionId: string, winner: string, until: () => Promise<boolean> = () => Promise.resolve(false)): Promise<void> {
    let winnerVisits = 0
    for (let i = 0; i < 100; i++) {
      const s = engine.getSession(sessionId)
      if (!s || s.status !== 'active' || (await until())) return
      const user = s.seats[currentSeat(s)].controllerUserId
      const state = s.currentState as { stage: string; bullOff: { result: { rethrow: boolean } | null } }
      if (state.stage === 'bulloff' && state.bullOff.result && !state.bullOff.result.rethrow) {
        await engine.onUserAction(sessionId, s.ownerUserId, { type: 'bulloff_start' })
        continue
      }
      const darts =
        state.stage === 'bulloff'
          ? [user === winner ? BULL : S20]
          : user !== winner
            ? [S1, S1, S1]
            : winnerVisits++ % 2 === 0
              ? [T20, T20, T20]
              : [T20, T17, D5]
      for (const segment of darts) await engine.onUserAction(sessionId, user, { type: 'add_dart', segment })
      if (engine.getSession(sessionId)?.status === 'active') await engine.onUserAction(sessionId, user, { type: 'takeout' })
    }
    throw new Error('the game did not finish')
  }

  async function register(tournamentId: string, userIds: string[]): Promise<void> {
    for (const u of userIds)
      expect(await registerSolo(db, tournamentId, { id: u, name: u, hasBoard: false, eligible: true }, new Date(now))).toBe('open')
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_service_test'))
    await insertUsers(db, ['org', ...players])
  })

  afterAll(async () => {
    await close()
  })

  beforeEach(async () => {
    now = Date.parse('2026-11-12T18:00:00Z')
    online = new Set(players)
    sent = []
    await boot()
  })

  it('runs an 8-player single elimination end to end, and picks up after a restart', async () => {
    await insertTournament(db, {
      id: 'se8',
      owner_user_id: 'org',
      status: 'open',
      game_config: JSON.stringify({ startScore: 301 }),
      starts_at: new Date(now + 60 * MIN),
      settings: settings(),
    })
    await register('se8', players)

    // Check-in opens 30 minutes before the start and tells everyone registered
    now += 31 * MIN
    await service.tick()
    expect((await tournament('se8')).status).toBe('check_in')
    expect(sent.filter(([, m]) => m.type === 'tournament.checkIn').map(([u]) => u)).toEqual(players)
    for (const u of players) expect(await checkIn(db, 'se8', u)).toBe(true)

    // The start: drawn by rating (all equal, so registration order), every quarter-final starts
    now += 30 * MIN
    await service.tick()
    expect((await tournament('se8')).status).toBe('running')
    const qf = (await matches('se8')).filter(m => m.round === 1)
    expect(qf.map(m => m.status)).toEqual(['live', 'live', 'live', 'live'])
    const on = sent.filter((x): x is [string, TournamentMatchMessage] => x[1].type === 'tournament.match')
    expect(on.map(([u, m]) => `${u}:${m.opponent}`).sort()).toEqual([
      'p1:p8',
      'p2:p7',
      'p3:p6',
      'p4:p5',
      'p5:p4',
      'p6:p3',
      'p7:p2',
      'p8:p1',
    ])

    // The better seed wins every match; a semi-final starts as soon as both its players are done
    for (const u of ['p1', 'p4', 'p2', 'p3']) await play(gameOf(u), u)
    const sf = (await matches('se8')).filter(m => m.round === 2)
    expect(sf.map(m => m.status)).toEqual(['live', 'live'])
    await play(gameOf('p1'), 'p1')

    // A restart while the other semi-final is on: the game is rebuilt and the bracket goes on
    await boot()
    await play(gameOf('p2'), 'p2')
    const [final] = (await matches('se8')).filter(m => m.round === 3)
    expect(final.status).toBe('live')
    expect(final.first_to).toBe(2)
    await play(gameOf('p1'), 'p1')

    const done = await matches('se8')
    expect(done.every(m => m.status === 'finished' && m.outcome === 'played')).toBe(true)
    expect(done.at(-1)).toMatchObject({ legs_a: 2, legs_b: 0 })
    expect((await tournament('se8')).status).toBe('finished')
    const places = await db
      .selectFrom('tournament_entries')
      .select(['name', 'final_place', 'seed'])
      .where('tournament_id', '=', 'se8')
      .execute()
    expect(Object.fromEntries(places.map(p => [p.name, p.final_place]))).toEqual({ p1: 1, p2: 2, p3: 3, p4: 3, p5: 5, p6: 5, p7: 5, p8: 5 })
    // Every seat played for its tournament spot
    const seats = await db
      .selectFrom('game_players as gp')
      .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
      .select('gp.tournament_player_id')
      .where(
        'gs.tournament_match_id',
        'in',
        done.map(m => m.id),
      )
      .execute()
    expect(seats).toHaveLength(14)
    expect(seats.every(s => s.tournament_player_id !== null)).toBe(true)
  })

  it('checks an unlocked average limit again when check-in opens, and keeps every spot under a locked one', async () => {
    // Nobody here averages 170: everyone is outside the limit by now
    const avgLimit = { min: 170, max: null, teams: 'every', minLegs: 0 }
    for (const [id, lock] of [
      ['avg-open', false],
      ['avg-locked', true],
    ] as const) {
      await insertTournament(db, {
        id,
        owner_user_id: 'org',
        status: 'open',
        max_entries: 4,
        settings: settings({ registrationClosesMinutes: null, checkInMinutes: 2, avgLimit: { ...avgLimit, lock } }),
      })
      await register(id, ['p1', 'p2'])
      sent = []
      expect(await service.organizerStart(id)).toBe('started')
      const statuses = await db.selectFrom('tournament_entries').select('status').where('tournament_id', '=', id).execute()
      expect(statuses.map(e => e.status)).toEqual(lock ? ['registered', 'registered'] : ['withdrawn', 'withdrawn'])
      expect(sent.filter(([, m]) => m.type === 'tournament.checkIn')).toHaveLength(lock ? 2 : 0)
      // Who lost the spot is told why
      const dropped = sent.flatMap(([u, m]) => (m.type === 'tournament.dropped' ? [[u, m.tournamentId] as const] : []))
      expect(dropped).toEqual(
        lock
          ? []
          : [
              ['p1', id],
              ['p2', id],
            ],
      )
    }
  })

  it('drops who did not check in, gives a no-show the loss after the wait, and replays an aborted game', async () => {
    await insertTournament(db, {
      id: 'ns',
      owner_user_id: 'org',
      status: 'open',
      max_entries: 4,
      game_config: JSON.stringify({ startScore: 301 }),
      settings: settings({ seeding: 'manual', registrationClosesMinutes: null, checkInMinutes: 2, longerFinal: null }),
    })
    await register('ns', ['p1', 'p2', 'p3', 'p4'])
    expect(await service.organizerStart('ns')).toBe('started')
    expect((await tournament('ns')).status).toBe('check_in')
    for (const u of ['p1', 'p2', 'p3']) await checkIn(db, 'ns', u)
    online.delete('p3')

    now += 2 * MIN
    await service.tick()
    const entries = await db
      .selectFrom('tournament_entries')
      .select(['name', 'status', 'seed'])
      .where('tournament_id', '=', 'ns')
      .orderBy('name')
      .execute()
    expect(entries.map(e => `${e.name}:${e.status}:${e.seed}`)).toEqual([
      'p1:checked_in:1',
      'p2:checked_in:2',
      'p3:checked_in:3',
      'p4:withdrawn:null',
    ])
    // Three entries: seed 1 has a bye, p2 waits for p3, who is offline
    const [semi1, waiting] = await matches('ns')
    expect(semi1).toMatchObject({ status: 'finished', outcome: 'bye' })
    expect(waiting.status).toBe('ready')

    now += 9 * MIN
    await service.tick()
    expect((await matches('ns'))[1].status).toBe('ready')
    // The wait counts from the stored time, so a restart in between changes nothing
    await boot()
    now += 2 * MIN
    await service.tick()
    const [, semi2, final] = await matches('ns')
    expect(semi2).toMatchObject({ status: 'finished', outcome: 'walkover', winner_entry_id: semi2.entry_a_id })
    expect(final.status).toBe('live')

    // The final's game is aborted while p2 is away: the match waits again, and starts again on their return
    const first = gameOf('p1')
    online.delete('p2')
    await engine.deleteSession(first)
    expect((await matches('ns'))[2].status).toBe('ready')
    online.add('p2')
    await service.tick()
    expect((await matches('ns'))[2].status).toBe('live')
    expect(gameOf('p1')).not.toBe(first)
  })
  it('aborts the game of a player who withdraws once it runs, and gives the match to the other side', async () => {
    await insertTournament(db, {
      id: 'wd',
      owner_user_id: 'org',
      status: 'open',
      max_entries: 2,
      game_config: JSON.stringify({ startScore: 301 }),
      settings: settings({ seeding: 'manual', registrationClosesMinutes: null, checkInMinutes: 2, longerFinal: null }),
    })
    await register('wd', ['p5', 'p6'])
    await service.organizerStart('wd')
    for (const u of ['p5', 'p6']) await checkIn(db, 'wd', u)
    now += 2 * MIN
    await service.tick()
    const game = gameOf('p5')
    const entryId = await withdrawSolo(db, 'wd', 'p6')
    expect(entryId).not.toBeNull()
    await service.withdrawn('wd', entryId ?? '')
    expect(engine.getSession(game)?.status).not.toBe('active')
    const [final] = await matches('wd')
    expect(final).toMatchObject({ status: 'finished', outcome: 'walkover', winner_entry_id: final.entry_a_id })
    expect((await tournament('wd')).status).toBe('finished')
  })
  it('keeps waiting for a missing player when the organizer turned no-show forfeits off', async () => {
    await insertTournament(db, {
      id: 'patient',
      owner_user_id: 'org',
      status: 'open',
      max_entries: 2,
      game_config: JSON.stringify({ startScore: 301 }),
      settings: settings({ seeding: 'manual', registrationClosesMinutes: null, checkInMinutes: 2, longerFinal: null, noShowMinutes: null }),
    })
    await register('patient', ['p7', 'p8'])
    await service.organizerStart('patient')
    for (const u of ['p7', 'p8']) await checkIn(db, 'patient', u)
    online.delete('p8')
    now += 2 * MIN
    await service.tick()
    now += 120 * MIN
    await service.tick()
    expect((await matches('patient'))[0].status).toBe('ready')
  })
  it('gives the match to the other side when a player ends the game themselves', async () => {
    await insertTournament(db, {
      id: 'quit',
      owner_user_id: 'org',
      status: 'open',
      max_entries: 2,
      game_config: JSON.stringify({ startScore: 301 }),
      settings: settings({ seeding: 'manual', registrationClosesMinutes: null, checkInMinutes: 2, longerFinal: null }),
    })
    await register('quit', ['p5', 'p6'])
    await service.organizerStart('quit')
    for (const u of ['p5', 'p6']) await checkIn(db, 'quit', u)
    now += 2 * MIN
    await service.tick()
    await engine.deleteSession(gameOf('p5'), 'p5')
    const [quit] = await matches('quit')
    expect(quit).toMatchObject({ status: 'finished', outcome: 'walkover', winner_entry_id: quit.entry_b_id })
  })
  it('shows the bracket live: the games, their legs as they are won, the schedule, and lets anyone who sees it watch', async () => {
    const start = now + 60 * MIN
    await insertTournament(db, {
      id: 'live4',
      owner_user_id: 'org',
      status: 'open',
      game_config: JSON.stringify({ startScore: 301 }),
      starts_at: new Date(start),
      settings: settings({ firstTo: 2, longerFinal: null, checkInMinutes: null }),
    })
    const four = ['q1', 'q2', 'q3', 'q4']
    await insertUsers(db, four)
    for (const u of four) online.add(u)
    await register('live4', four)
    const view = () => liveMessage(db, engine, 'live4', now)
    const before = await view()
    expect(before).toMatchObject({ status: 'open', matches: [], tables: [], schedule: [] })
    expect(before?.entries.map(e => e.name)).toEqual(['q1', 'q2', 'q3', 'q4'])

    now = start
    await service.tick()
    const on = await view()
    const name = (id: string | null) => on?.entries.find(e => e.id === id)?.name ?? null
    expect(on?.matches.map(m => [m.key, m.status, m.sides.map(name), m.legs, m.game?.sessionId ?? null])).toEqual([
      ['R1M1', 'live', ['q1', 'q4'], [0, 0], gameOf('q1')],
      ['R1M2', 'live', ['q2', 'q3'], [0, 0], gameOf('q2')],
      ['R2M1', 'pending', [null, null], [0, 0], null],
    ])
    // First to 2 is at most 3 legs, 12 minutes
    expect(on?.schedule).toEqual([
      { bracket: 'main', round: 1, name: 'Semi-finals', state: 'now', at: null },
      { bracket: 'main', round: 2, name: 'Final', state: 'later', at: new Date(start + 12 * MIN).toISOString() },
    ])

    // A leg won shows while the game goes on
    const first = gameOf('q1')
    await play(first, 'q1', async () => (await view())?.matches[0].legs[0] === 1)
    expect((await view())?.matches[0]).toMatchObject({ status: 'live', legs: [1, 0], game: { sessionId: first } })

    // Anyone who may see the tournament may watch its games
    const [semi] = await matches('live4')
    expect(await seesTournamentOfMatch(db, semi.id, 'p8')).toBe(true)
    await db.updateTable('tournaments').set({ access: 'friends' }).where('id', '=', 'live4').execute()
    expect(await seesTournamentOfMatch(db, semi.id, 'p8')).toBe(false)

    await play(first, 'q1')
    const after = await view()
    expect(after?.matches[0]).toMatchObject({ status: 'finished', outcome: 'played', winner: 0, legs: [2, 0], game: null })
    expect(after?.matches[2].sides.map(id => after.entries.find(e => e.id === id)?.name ?? null)).toEqual(['q1', null])
  })
})
