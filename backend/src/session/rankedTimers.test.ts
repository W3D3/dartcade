import { describe, it, expect, vi, afterEach } from 'vitest'
import { SessionEngine, type EngineStore, type GameEnded } from './engine.js'
import { x01Module } from '../games/x01.js'
import { DISCONNECT_SECONDS } from '../shared/ranked.js'
import { newSession } from './replay.js'
import { RankedTimers } from './rankedTimers.js'
import type { RankedRules } from './rankedClock.js'
import type { RankedGame, Seat } from './types.js'

const seat = (name: string, user: string, boardId: string | null = null): Seat => ({
  name,
  userId: user,
  controllerUserId: user,
  boardId,
  boardName: boardId,
  bot: null,
})
const duel = [seat('Ann', 'ann'), seat('Bob', 'bob')]
const rules: RankedRules = { visitSeconds: 10, reserveSeconds: 20, manualEntry: true }
const long: RankedRules = { visitSeconds: 3600, reserveSeconds: 3600, manualEntry: true }
const game = (mode: '1v1' | '2v2', r: RankedRules): RankedGame => ({
  mode,
  sides:
    mode === '1v1'
      ? [['ann'], ['bob']]
      : [
          ['ann', 'bob'],
          ['cal', 'dee'],
        ],
  entries: {},
  rules: r,
})
const config = { ...x01Module.defaultConfig, bullOff: 'off' as const }
const T0 = 1_000_000
const sec = (n: number) => n * 1000

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

async function start(
  o: { seats?: Seat[]; r?: RankedRules; mode?: '1v1' | '2v2'; cfg?: Record<string, unknown>; connected?: string[] } = {},
) {
  vi.useFakeTimers({ now: T0 })
  const store = makeStore()
  const connected = new Set(o.connected ?? ['ann', 'bob', 'cal', 'dee'])
  const boards = new Set<string>()
  const ended: GameEnded[] = []
  const engine = new SessionEngine(store, vi.fn(), undefined, undefined, e => void ended.push(e), undefined, {
    connectedUsers: () => connected,
    isBoardOnline: b => boards.has(b),
  })
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: 'ann',
    gameId: 'x01',
    config: { ...config, ...o.cfg },
    seats: o.seats ?? duel,
    ranked: game(o.mode ?? '1v1', o.r ?? rules),
  })
  const session = () => engine.getSession(sessionId)
  const takeout = (user: string) => engine.onUserAction(sessionId, user, { type: 'takeout' })
  return { engine, store, sessionId, session, connected, boards, ended, takeout }
}

describe('the ranked clock timer', () => {
  it('forfeits the seat that is up once its visit and reserve are used up, and not before', async () => {
    const g = await start()
    await vi.advanceTimersByTimeAsync(sec(29))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [0] })
    expect(g.store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'system', kind: 'clock.forfeit' }))
  })

  it('spends the reserve on visits that run over, then forfeits', async () => {
    const g = await start()
    await vi.advanceTimersByTimeAsync(sec(15))
    await g.takeout('ann') // 5 s over: reserve 15 s
    await vi.advanceTimersByTimeAsync(sec(15))
    await g.takeout('bob') // 5 s over: reserve 15 s
    // Ann is up with 10 s of visit and 15 s of reserve
    await vi.advanceTimersByTimeAsync(sec(24))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [0] })
  })

  it('spends no reserve on the bull off', async () => {
    const g = await start({ r: { ...rules, visitSeconds: 600 }, cfg: { bullOff: 'pdc' } })
    await vi.advanceTimersByTimeAsync(sec(500))
    expect(g.session()?.status).toBe('active')
    expect(g.session()?.clock?.reserve.slice(0, 2)).toEqual([sec(20), sec(20)])
  })

  it('shares one reserve between the players of a team', async () => {
    const seats = [seat('Ann', 'ann'), seat('Bob', 'bob'), seat('Cal', 'cal'), seat('Dee', 'dee')]
    const g = await start({ seats, mode: '2v2', cfg: { format: 'teams', teams: [0, 0, 1, 1] } })
    const teamOf = (i: number) => (i < 2 ? 0 : 1)
    const up = () => g.session()?.module.getCurrentPlayer(g.session()?.currentState)
    // Four visits: team 0 runs 5 s over each time, team 1 is on time
    for (let n = 0; n < 4; n++) {
      const i = up() ?? 0
      await vi.advanceTimersByTimeAsync(sec(teamOf(i) === 0 ? 15 : 8))
      await g.takeout(seats[i].controllerUserId)
    }
    expect(g.session()?.clock?.reserve.slice(0, 2)).toEqual([sec(10), sec(20)])
    // When team 0's reserve runs out, both its players forfeit
    for (let n = 0; n < 8 && g.session()?.status === 'active'; n++) {
      const i = up() ?? 0
      await vi.advanceTimersByTimeAsync(sec(teamOf(i) === 0 ? 40 : 8))
      if (g.session()?.status === 'active') await g.takeout(seats[i].controllerUserId)
    }
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [0, 1] })
  })

  it('arms again after a restart with a fresh visit window and the reserves as they were', async () => {
    const first = await start()
    await vi.advanceTimersByTimeAsync(sec(15))
    await first.takeout('ann') // reserve 15 s
    const live = first.session()
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
        ranked: game('1v1', rules),
        players: duel.map(s => ({
          name: s.name,
          user_id: s.userId,
          controller_user_id: s.userId,
          board_db_id: null,
          board_name: null,
          bot_level: null,
        })),
      },
    ])
    first.engine.getAllSessions().forEach(s => void first.engine.deleteSession(s.id))
    // Down for ten minutes, then back: Bob is up and has a whole visit and his 20 s reserve
    await vi.advanceTimersByTimeAsync(sec(600))
    const engine = new SessionEngine(store, vi.fn(), undefined, undefined, undefined, undefined, {
      connectedUsers: () => new Set(['ann', 'bob']),
    })
    await engine.rebuild()
    expect(engine.getSession(first.sessionId)?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(29))
    expect(engine.getSession(first.sessionId)?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(engine.getSession(first.sessionId)).toMatchObject({ status: 'finished', forfeited: [1] })
  })
})

describe('the bull off no-show limit', () => {
  const bull = { name: '50', number: 50, bed: 'Double' as const, multiplier: 1 as const }
  const miss = { name: 'Miss', number: 0, bed: 'Outside' as const, multiplier: 0 as const }
  const thrower = (g: Awaited<ReturnType<typeof start>>) => g.session()?.module.getCurrentPlayer(g.session()?.currentState) ?? -1
  const userOf = (i: number) => duel[i].controllerUserId
  const throwDart = async (g: Awaited<ReturnType<typeof start>>, segment: typeof bull | typeof miss) => {
    const user = userOf(thrower(g))
    await g.engine.onUserAction(g.sessionId, user, { type: 'add_dart', segment })
    await g.takeout(user)
  }

  it('forfeits the seat that has to throw once a visit’s time has passed without a throw', async () => {
    const g = await start({ cfg: { bullOff: 'pdc' } })
    const first = thrower(g)
    await vi.advanceTimersByTimeAsync(sec(9))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [first] })
    expect(g.store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'system', kind: 'clock.forfeit' }))
  })

  it('opens a fresh window for the next thrower when a throw comes in time', async () => {
    const g = await start({ cfg: { bullOff: 'pdc' } })
    const first = thrower(g)
    await vi.advanceTimersByTimeAsync(sec(8))
    await throwDart(g, bull)
    const second = thrower(g)
    expect(second).not.toBe(first)
    await vi.advanceTimersByTimeAsync(sec(9))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [second] })
    expect(g.session()?.clock?.reserve.slice(0, 2)).toEqual([sec(20), sec(20)])
  })

  it('waits for nobody once the result is in, and opens a fresh window when a tie is thrown again', async () => {
    const g = await start({ cfg: { bullOff: 'pdc' } })
    await throwDart(g, miss)
    await throwDart(g, miss) // nobody hit the bull: to be thrown again
    await vi.advanceTimersByTimeAsync(sec(600))
    expect(g.session()?.status).toBe('active')
    await g.engine.onUserAction(g.sessionId, 'ann', { type: 'bulloff_rethrow' })
    const again = thrower(g)
    await vi.advanceTimersByTimeAsync(sec(9))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [again] })
  })

  it('starts the window over after a restart', async () => {
    const first = await start({ cfg: { bullOff: 'pdc' } })
    const live = first.session()
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([
      {
        id: first.sessionId,
        owner_user_id: 'ann',
        board_db_id: null,
        game_id: 'x01',
        game_version: x01Module.version,
        rng_seed: live?.seed,
        config: { ...config, bullOff: 'pdc' },
        created_at: live?.createdAt,
        lobby_id: null,
        lobby_name: null,
        ranked: game('1v1', rules),
        players: duel.map(s => ({
          name: s.name,
          user_id: s.userId,
          controller_user_id: s.userId,
          board_db_id: null,
          board_name: null,
          bot_level: null,
        })),
      },
    ])
    first.engine.getAllSessions().forEach(s => void first.engine.deleteSession(s.id))
    await vi.advanceTimersByTimeAsync(sec(600))
    const engine = new SessionEngine(store, vi.fn(), undefined, undefined, undefined, undefined, {
      connectedUsers: () => new Set(['ann', 'bob']),
    })
    await engine.rebuild()
    expect(engine.getSession(first.sessionId)?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(9))
    expect(engine.getSession(first.sessionId)?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(engine.getSession(first.sessionId)?.status).toBe('finished')
  })
})

describe('the ranked disconnect timer', () => {
  const grace = sec(DISCONNECT_SECONDS)

  it('forfeits a player who stays away for two minutes, and a reconnect cancels it', async () => {
    const g = await start({ r: long, connected: ['ann'] }) // Bob has no screen open
    await vi.advanceTimersByTimeAsync(grace - sec(1))
    expect(g.session()?.status).toBe('active')
    // He is back in time: nothing happens, however long it goes on
    g.connected.add('bob')
    g.engine.onPresenceChange(g.sessionId)
    await vi.advanceTimersByTimeAsync(grace * 3)
    expect(g.session()?.status).toBe('active')
    // He leaves again: the grace period starts over
    g.connected.delete('bob')
    g.engine.onPresenceChange(g.sessionId)
    await vi.advanceTimersByTimeAsync(grace - sec(1))
    expect(g.session()?.status).toBe('active')
    await vi.advanceTimersByTimeAsync(sec(1))
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [1] })
    expect(g.store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'system', kind: 'presence.forfeit' }))
  })

  it('counts a player with a board online as present with the browser closed, until it goes offline', async () => {
    const g = await start({ r: long, seats: [seat('Ann', 'ann'), seat('Bob', 'bob', 'b1')], connected: ['ann'] })
    g.boards.add('b1')
    g.engine.onBoardPresence('b1')
    await vi.advanceTimersByTimeAsync(grace * 5)
    expect(g.session()?.status).toBe('active')
    g.boards.delete('b1')
    g.engine.onBoardPresence('b1')
    await vi.advanceTimersByTimeAsync(grace)
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [1] })
  })

  it('treats everyone as just disconnected after a restart', async () => {
    const first = await start({ r: long })
    const live = first.session()
    const store = makeStore()
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
        ranked: game('1v1', long),
        players: duel.map(s => ({
          name: s.name,
          user_id: s.userId,
          controller_user_id: s.userId,
          board_db_id: null,
          board_name: null,
          bot_level: null,
        })),
      },
    ])
    first.engine.getAllSessions().forEach(s => void first.engine.deleteSession(s.id))
    const connected = new Set<string>()
    const engine = new SessionEngine(store, vi.fn(), undefined, undefined, undefined, undefined, { connectedUsers: () => connected })
    await engine.rebuild()
    await vi.advanceTimersByTimeAsync(grace - sec(1))
    expect(engine.getSession(first.sessionId)?.status).toBe('active')
    connected.add('ann')
    engine.onPresenceChange(first.sessionId)
    await vi.advanceTimersByTimeAsync(sec(1))
    // Ann came back in time, Bob did not
    expect(engine.getSession(first.sessionId)).toMatchObject({ status: 'finished', forfeited: [1] })
  })
})

describe('leaving a ranked game', () => {
  it('is the same forfeit, recorded once, and the timers then do nothing', async () => {
    const g = await start({ connected: ['ann'] })
    await g.engine.onUserAction(g.sessionId, 'bob', { type: 'forfeit' })
    expect(g.session()).toMatchObject({ status: 'finished', forfeited: [1] })
    await vi.advanceTimersByTimeAsync(sec(3600))
    expect(g.store.finishSession).toHaveBeenCalledTimes(1)
    expect(g.ended).toHaveLength(1)
    expect(g.store.appendEvent.mock.calls.filter(([e]) => e.kind.endsWith('forfeit') || e.kind === 'forfeit')).toHaveLength(1)
  })
})

describe('a forfeit that fails to log', () => {
  it('is reported, not thrown, and tried again', async () => {
    vi.useFakeTimers({ now: T0 })
    const session = newSession({
      id: 's',
      ownerUserId: 'ann',
      boardId: null,
      module: x01Module,
      config,
      seats: duel,
      seed: 1,
      createdAt: new Date(T0),
      ranked: game('1v1', rules),
    })
    const fire = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined)
    const warn = vi.fn()
    const timers = new RankedTimers({ fire, connected: () => new Set(['ann', 'bob']), boardOnline: () => false, warn })
    timers.sync(session)
    await vi.advanceTimersByTimeAsync(sec(30))
    expect(fire).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not logged'), expect.objectContaining({ type: 'clock.forfeit' }))
    await vi.advanceTimersByTimeAsync(sec(5) + 1)
    expect(fire).toHaveBeenCalledTimes(2)
    timers.stop(session.id)
  })
})
