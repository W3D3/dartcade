import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from './types.js'
import type { RankedRules } from './rankedClock.js'
import { DISCONNECT_SECONDS } from '../shared/ranked.js'

const seat = (name: string, user: string): Seat => ({
  name,
  userId: user,
  controllerUserId: user,
  boardId: null,
  boardName: null,
  bot: null,
})

const rules: RankedRules = { visitSeconds: 10, reserveSeconds: 20, manualEntry: true }

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
    getRankedRules: vi.fn().mockResolvedValue(undefined),
  } satisfies EngineStore
}

async function start(opts: { rules?: RankedRules; connected?: string[] } = {}) {
  const store = makeStore()
  const connected = new Set(opts.connected ?? ['ann', 'bob'])
  const engine = new SessionEngine(store, vi.fn(), undefined, undefined, undefined, undefined, { connectedUsers: () => connected })
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: 'ann',
    gameId: 'x01',
    config: { ...x01Module.defaultConfig, bullOff: 'off' },
    seats: [seat('Ann', 'ann'), seat('Bob', 'bob')],
    ranked: { rules: opts.rules ?? rules, stakes: [{ win: 16, loss: 16 }, null] },
  })
  const session = engine.getSession(sessionId)
  if (!session?.ranked) throw new Error('not ranked')
  return { engine, store, sessionId, session, clock: session.ranked, connected }
}

// Ann is up first: a visit of three misses by hand ends it
const visit = (engine: SessionEngine, id: string, user: string) => engine.onUserAction(id, user, { type: 'takeout' })

describe('ranked clock', () => {
  it('charges the reserve for the time a committed visit ran over', async () => {
    const { engine, sessionId, clock } = await start()
    const t0 = clock.visitStart
    vi.useFakeTimers({ now: t0 + 15_000 })
    await visit(engine, sessionId, 'ann')
    vi.useRealTimers()
    // 15 s for a 10 s visit: 5 s of the 20 s reserve are gone, Bob's is whole
    expect(clock.reserve.slice(0, 2)).toEqual([15_000, 20_000])
  })

  it('shows the clock, the reserve and the stakes in the snapshot', async () => {
    const { engine, sessionId, clock } = await start()
    const snap = engine.getSnapshot(sessionId)
    expect(snap?.ranked).toMatchObject({
      visitSeconds: 10,
      reserveSeconds: 20,
      manualEntry: true,
      visitDeadline: new Date(clock.visitStart + 10_000).toISOString(),
      forfeitAt: new Date(clock.visitStart + 30_000).toISOString(),
      seats: [
        { reserveSeconds: 20, inReserve: false, stakes: { win: 16, loss: 16 } },
        { reserveSeconds: 20, inReserve: false, stakes: null },
      ],
    })
  })

  it('forfeits the team that is up once its visit and reserve are used up', async () => {
    const { engine, store, sessionId, clock } = await start()
    await engine.tickRanked(clock.visitStart + 29_000)
    expect(engine.getSession(sessionId)?.status).toBe('active')
    await engine.tickRanked(clock.visitStart + 30_000)
    const session = engine.getSession(sessionId)
    expect(session?.status).toBe('finished')
    expect(session?.forfeited).toEqual([0])
    expect(store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'forfeit', data: { type: 'forfeit', seats: [0] } }))
    expect(store.finishSession).toHaveBeenCalledOnce()
  })

  it('forfeits a controller who stays away past the disconnect time, and not before', async () => {
    const { engine, sessionId, connected } = await start({ rules: { ...rules, reserveSeconds: 3600 } })
    connected.delete('bob')
    const t = Date.now()
    await engine.tickRanked(t)
    await engine.tickRanked(t + (DISCONNECT_SECONDS - 1) * 1000)
    expect(engine.getSession(sessionId)?.status).toBe('active')
    // Back in time: the timer starts over
    connected.add('bob')
    await engine.tickRanked(t + (DISCONNECT_SECONDS - 1) * 1000 + 500)
    connected.delete('bob')
    await engine.tickRanked(t + DISCONNECT_SECONDS * 1000 + 1000)
    expect(engine.getSession(sessionId)?.status).toBe('active')
    await engine.tickRanked(t + 2 * DISCONNECT_SECONDS * 1000 + 2000)
    expect(engine.getSession(sessionId)?.forfeited).toEqual([1])
    expect(engine.getSession(sessionId)?.status).toBe('finished')
  })

  it('lets one side lose when both players are gone', async () => {
    const { engine, sessionId, connected } = await start({ rules: { ...rules, reserveSeconds: 3600 } })
    connected.clear()
    const t = Date.now()
    await engine.tickRanked(t)
    await engine.tickRanked(t + DISCONNECT_SECONDS * 1000)
    expect(engine.getSession(sessionId)?.forfeited).toEqual([0])
  })

  it('cannot be aborted, leaving forfeits', async () => {
    const { engine, sessionId } = await start()
    expect(await engine.deleteSession(sessionId, 'ann')).toBe(false)
    expect(engine.getSession(sessionId)?.status).toBe('active')
    await engine.onUserAction(sessionId, 'bob', { type: 'forfeit' })
    expect(engine.getSession(sessionId)?.forfeited).toEqual([1])
  })

  it('refuses hand-entered darts when manual entry is off', async () => {
    const { engine, sessionId } = await start({ rules: { ...rules, manualEntry: false } })
    const dart = { type: 'add_dart' as const, segment: { name: 'T20', number: 20, bed: 'Triple' as const, multiplier: 3 as const } }
    expect(await engine.onUserAction(sessionId, 'ann', dart)).toEqual({ ok: false, code: 'forbidden' })
    const on = await start()
    expect(await on.engine.onUserAction(on.sessionId, 'ann', dart)).toEqual({ ok: true })
  })

  it('brings the rules and the reserves back when the game is rebuilt', async () => {
    const first = await start()
    const t0 = first.clock.visitStart
    vi.useFakeTimers({ now: t0 + 15_000 })
    await visit(first.engine, first.sessionId, 'ann')
    vi.useRealTimers()
    const logged = first.store.appendEvent.mock.calls.map(([e], i) => ({ ...e, seq: i }))
    const store = makeStore()
    store.getRankedRules.mockResolvedValue({ rules, stakes: [null, null] })
    store.getSessionEvents.mockResolvedValue(logged)
    store.getActiveSessions.mockResolvedValue([
      {
        id: first.sessionId,
        owner_user_id: 'ann',
        board_db_id: null,
        game_id: 'x01',
        game_version: x01Module.version,
        rng_seed: first.session.seed,
        config: { ...x01Module.defaultConfig, bullOff: 'off' },
        lobby_id: null,
        lobby_name: null,
        created_at: first.session.createdAt,
        players: [
          { name: 'Ann', user_id: 'ann', controller_user_id: 'ann', board_db_id: null, board_name: null, bot_level: null },
          { name: 'Bob', user_id: 'bob', controller_user_id: 'bob', board_db_id: null, board_name: null, bot_level: null },
        ],
      },
    ])
    const engine = new SessionEngine(store, vi.fn())
    await engine.rebuild()
    const clock = engine.getSession(first.sessionId)?.ranked
    expect(clock?.rules).toEqual(rules)
    expect(clock?.reserve.slice(0, 2)).toEqual([15_000, 20_000])
  })
})
