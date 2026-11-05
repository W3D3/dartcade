import { describe, it, expect, vi, afterEach } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { newSession, replay, type LoggedInput } from './replay.js'
import { chargeVisit, deadlines, newRankedClock, reserveLeft, restartVisit, type RankedRules } from './rankedClock.js'
import { authorizeAction } from './access.js'
import { x01Module } from '../games/x01.js'
import { ClientMessageSchema } from '../schema/zod.js'
import type { RankedGame, Seat } from './types.js'

const seat = (name: string, user: string): Seat => ({
  name,
  userId: user,
  controllerUserId: user,
  boardId: null,
  boardName: null,
  bot: null,
})
const seats = [seat('Ann', 'ann'), seat('Bob', 'bob')]
const rules: RankedRules = { visitSeconds: 10, reserveSeconds: 20, manualEntry: true }
const ranked = (r: RankedRules | null = rules): RankedGame => ({ mode: '1v1', sides: [['ann'], ['bob']], ratings: {}, rules: r })
const config = { ...x01Module.defaultConfig, bullOff: 'off' as const }

function makeStore() {
  return {
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getSessionEvents: vi.fn().mockResolvedValue([]),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    insertDarts: vi.fn().mockResolvedValue(undefined),
    deleteDarts: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    abortSession: vi.fn().mockResolvedValue(undefined),
    getAvatars: vi.fn().mockResolvedValue(new Map()),
  } satisfies EngineStore
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the ranked clock as a reducer', () => {
  it('takes what a visit ran over off its team’s reserve, and starts the next visit then', () => {
    const clock = newRankedClock(rules, 2, new Date(0))
    chargeVisit(clock, 0, new Date(15_000))
    expect(clock.reserve).toEqual([15_000, 20_000])
    expect(clock.visitStart).toBe(15_000)
    chargeVisit(clock, 1, new Date(20_000))
    expect(clock.reserve).toEqual([15_000, 20_000])
  })

  it('never goes below an empty reserve, and reports the deadlines and the reserve left', () => {
    const clock = newRankedClock(rules, 2, new Date(0))
    chargeVisit(clock, 0, new Date(100_000))
    expect(clock.reserve[0]).toBe(0)
    chargeVisit(clock, 1, new Date(101_000))
    expect(deadlines(clock, 1)).toEqual({ visitDeadline: 111_000, forfeitAt: 131_000 })
    expect(reserveLeft(clock, 1, true, 105_000)).toBe(20_000)
    expect(reserveLeft(clock, 1, true, 116_000)).toBe(15_000)
    expect(reserveLeft(clock, 0, false, 116_000)).toBe(0)
  })

  it('starts the open visit over after a restart and leaves the reserves alone', () => {
    const clock = newRankedClock(rules, 2, new Date(0))
    chargeVisit(clock, 0, new Date(15_000))
    restartVisit(clock, new Date(900_000))
    expect(clock).toMatchObject({ visitStart: 900_000, reserve: [15_000, 20_000] })
  })
})

describe('the ranked clock in a game', () => {
  async function play(r: RankedGame = ranked()) {
    const store = makeStore()
    vi.useFakeTimers({ now: 1_000_000 })
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.createWithSeats({ ownerUserId: 'ann', gameId: 'x01', config, seats, ranked: r })
    return { engine, store, sessionId }
  }
  const takeout = (e: SessionEngine, id: string, user: string) => e.onUserAction(id, user, { type: 'takeout' })

  it('gives the same reserves and the same end when the log is replayed as in the live game', async () => {
    const { engine, store, sessionId } = await play()
    vi.setSystemTime(1_015_000)
    await takeout(engine, sessionId, 'ann')
    vi.setSystemTime(1_019_000)
    await takeout(engine, sessionId, 'bob')
    vi.setSystemTime(1_044_000)
    await takeout(engine, sessionId, 'ann')
    vi.setSystemTime(1_050_000)
    await engine.systemInput(sessionId, { type: 'clock.forfeit', seats: [1] })
    const live = engine.getSession(sessionId)
    expect(live?.status).toBe('finished')
    expect(live?.clock?.reserve.slice(0, 2)).toEqual([0, 20_000])

    const rows: LoggedInput[] = store.appendEvent.mock.calls.map(([e]) => ({
      seq: e.seq,
      source: e.source,
      kind: e.kind,
      data: e.data,
      created_at: e.created_at,
    }))
    expect(rows.map(r => r.source)).toEqual(['user', 'user', 'user', 'system'])
    const again = newSession({
      id: sessionId,
      ownerUserId: 'ann',
      boardId: null,
      module: x01Module,
      config,
      seats,
      seed: live?.seed ?? 0,
      createdAt: live?.createdAt ?? new Date(),
      ranked: ranked(),
    })
    const { won } = replay(again, rows, vi.fn())
    expect(won).toBe(true)
    expect(again.clock).toEqual(live?.clock)
    expect(again.forfeited).toEqual(live?.forfeited)
  })

  it('does not charge the bull off, which only starts the first visit’s window', async () => {
    const store = makeStore()
    vi.useFakeTimers({ now: 1_000_000 })
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'ann',
      gameId: 'x01',
      config: { ...config, bullOff: 'pdc' as const },
      seats,
      ranked: ranked(),
    })
    const bull = { name: '50', number: 50, bed: 'Double' as const, multiplier: 1 as const }
    const miss = { name: 'Miss', number: 0, bed: 'Outside' as const, multiplier: 0 as const }
    const thrown = async (user: string, segment: typeof bull | typeof miss) => {
      await engine.onUserAction(sessionId, user, { type: 'add_dart', segment })
      await engine.onUserAction(sessionId, user, { type: 'takeout' })
    }
    // Five minutes to find the board, then the bull off: Ann hits the bull, Bob misses
    vi.setSystemTime(1_300_000)
    await thrown('ann', bull)
    vi.setSystemTime(1_305_000)
    await thrown('bob', miss)
    const clock = engine.getSession(sessionId)?.clock
    expect(clock).toMatchObject({ visitStart: 1_305_000, reserve: [20_000, 20_000] })
    await engine.onUserAction(sessionId, 'ann', { type: 'bulloff_start' })
    // The first game visit is charged from the end of the bull off
    vi.setSystemTime(1_320_000)
    await engine.onUserAction(sessionId, 'ann', { type: 'takeout' })
    expect(engine.getSession(sessionId)?.clock?.reserve.slice(0, 2)).toEqual([15_000, 20_000])
  })

  it('brings the reserves back after a restart, and gives the visit in progress a fresh start', async () => {
    const first = await play()
    vi.setSystemTime(1_015_000)
    await takeout(first.engine, first.sessionId, 'ann')
    const live = first.engine.getSession(first.sessionId)
    const store = makeStore()
    store.getSessionEvents.mockResolvedValue(
      first.store.appendEvent.mock.calls.map(([e]) => ({
        seq: e.seq,
        source: e.source,
        kind: e.kind,
        data: e.data,
        created_at: e.created_at,
      })),
    )
    store.getActiveSessions.mockResolvedValue([
      {
        id: first.sessionId,
        owner_user_id: 'ann',
        board_db_id: null,
        game_id: 'x01',
        game_version: x01Module.version,
        rng_seed: live?.seed,
        config,
        created_at: live?.createdAt,
        lobby_id: null,
        lobby_name: null,
        ranked: ranked(),
        players: seats.map(s => ({
          name: s.name,
          user_id: s.userId,
          controller_user_id: s.userId,
          board_db_id: null,
          board_name: null,
          bot_level: null,
        })),
      },
    ])
    // The server was down for ten minutes
    vi.setSystemTime(1_615_000)
    const engine = new SessionEngine(store, vi.fn())
    await engine.rebuild()
    expect(engine.getSession(first.sessionId)?.clock).toMatchObject({ visitStart: 1_615_000, reserve: [15_000, 20_000] })
  })

  it('refuses hand-entered darts when the rules say no manual entry', async () => {
    const off = (await play(ranked({ ...rules, manualEntry: false }))).engine
    const session = off.getAllSessions()[0]
    const dart = { type: 'add_dart' as const, segment: { name: 'T20', number: 20, bed: 'Triple' as const, multiplier: 3 as const } }
    expect(authorizeAction(session, 'ann', dart)).toBeNull()
    expect(authorizeAction(session, 'ann', { type: 'takeout' })).toEqual({ type: 'takeout' })
  })
})

describe('inputs only the server may issue', () => {
  it('cannot come from a client: its message schema has no clock or presence action', () => {
    for (const type of ['clock.forfeit', 'presence.forfeit']) {
      expect(ClientMessageSchema.safeParse({ type: 'user_action', action: { type, seats: [1] } }).success).toBe(false)
    }
    expect(ClientMessageSchema.safeParse({ type: 'user_action', action: { type: 'forfeit', seats: [0] } }).success).toBe(true)
  })

  it('is not read back from a log row that claims another source, nor does a system row carry a user action', () => {
    const session = newSession({
      id: 's',
      ownerUserId: 'ann',
      boardId: null,
      module: x01Module,
      config,
      seats,
      seed: 1,
      createdAt: new Date(0),
      ranked: ranked(),
    })
    const warn = vi.fn()
    const rows: LoggedInput[] = [
      { seq: 0, source: 'user', kind: 'clock.forfeit', data: { type: 'clock.forfeit', seats: [0] }, created_at: new Date(1) },
      { seq: 1, source: 'system', kind: 'takeout', data: { type: 'takeout' }, created_at: new Date(2) },
      { seq: 2, source: 'client', kind: 'clock.forfeit', data: { type: 'clock.forfeit', seats: [0] }, created_at: new Date(3) },
    ]
    const { won } = replay(session, rows, warn)
    expect(won).toBe(false)
    expect(session.forfeited).toEqual([])
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
