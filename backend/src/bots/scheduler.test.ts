import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import type { Seat } from '../session/types.js'
import type { X01Game } from '../schema/game-ws.js'
import { x01Module } from '../games/x01.js'
import { atcModule } from '../games/atc.js'

const seat = (name: string, controllerUserId: string, boardId: string | null, bot: { level: number } | null = null): Seat => ({
  name,
  userId: bot ? null : controllerUserId,
  controllerUserId,
  boardId,
  boardName: boardId,
  bot,
})

function makeStore(): EngineStore {
  return {
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getSessionEvents: vi.fn().mockResolvedValue([]),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    insertDarts: vi.fn().mockResolvedValue(undefined),
    deleteDarts: vi.fn().mockResolvedValue(undefined),
    finishSession: vi.fn().mockResolvedValue(undefined),
    abortSession: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('bot scheduler', () => {
  it('a solo bot plays an entire leg to completion without any human input', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
      seats: [seat('Bot Lvl 10', 'chris', null, { level: 10 })],
    })
    // Run every scheduled timer to completion, letting any promises they kick off resolve
    // between rounds, until the game is won or a generous number of rounds has passed (guards
    // against an infinite loop if something's wrong, without hanging the test suite)
    for (let i = 0; i < 500; i++) {
      const snap = engine.getSnapshot(sessionId)
      if (!snap || snap.status !== 'active') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    const snap = engine.getSnapshot(sessionId)
    expect(snap?.status).toBe('finished')
  })

  it('undoing a bot dart mid-visit does not get stuck, and the redo is a new dart (not a replay)', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 501, botSpeed: 'fast' },
      seats: [seat('Bot Lvl 5', 'chris', null, { level: 5 })],
    })
    const dartsIn = (): number => {
      const g = engine.getSnapshot(sessionId)?.game
      return g && 'currentVisitDarts' in g ? g.currentVisitDarts.length : 0
    }
    // Advance in small steps and stop the instant the bot's first dart lands — 'fast' speed
    // draws each delay from [400, 800]ms, so a single big jump (e.g. 1000ms) can race past
    // this point into the *next* dart too (two short draws easily sum under 1000ms); small
    // steps checked after each one catch the state at exactly one dart, deterministically.
    for (let i = 0; i < 20 && dartsIn() === 0; i++) await vi.advanceTimersByTimeAsync(100)
    expect(dartsIn()).toBe(1)

    // The host undoes it (same controllerUserId as the bot's seat: 'chris')
    await engine.onUserAction(sessionId, 'chris', { type: 'undo_dart' })
    expect(dartsIn()).toBe(0)

    // The bot throws again without getting stuck or double-scheduling
    for (let i = 0; i < 20 && dartsIn() === 0; i++) await vi.advanceTimersByTimeAsync(100)
    expect(dartsIn()).toBe(1)
  })

  it('aborting a session with a bot dart pending does not throw after abort', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, botSpeed: 'slow' }, // a long delay, so abort definitely happens first
      seats: [seat('Bot Lvl 1', 'chris', null, { level: 1 })],
    })
    // A dart really is pending: 'slow' schedules the bot's first dart 3000-4500ms out
    // (session creation's own push already scheduled it), and this is well short of that.
    await vi.advanceTimersByTimeAsync(500)
    await engine.deleteSession(sessionId, 'chris')
    await vi.advanceTimersByTimeAsync(10_000)
    // No crash, and the session stays gone
    expect(engine.getSession(sessionId)).toBeUndefined()
  })

  it('a bot in a bull off aims at the bull (not wherever X01 scoring would aim), and the bull off resolves', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, bullOff: 'wdc', botSpeed: 'fast' },
      // Level 10's tight grouping makes a near-bull landing reliable enough to assert on
      // directly, which is the point: a throw aimed at treble 20 instead (the bug this
      // regression test exists for) would land ~100mm out, not within this radius.
      seats: [{ ...seat('Bot Lvl 10', 'chris', null, { level: 10 }) }, { ...seat('Bot Lvl 10', 'chris', null, { level: 10 }) }],
    })
    expect((engine.getSnapshot(sessionId)!.game as X01Game).phase).toBe('bulloff')
    // One dart's worth of delay: just enough for the first bot's single bull-off throw to land
    await vi.advanceTimersByTimeAsync(1000)
    const midThrow = (engine.getSnapshot(sessionId)!.game as X01Game).bullOff?.throws[0]
    expect(midThrow).not.toBeNull()
    expect(midThrow?.mm ?? Infinity).toBeLessThan(60) // treble 20 is ~100mm+ out; the bull is 0
    for (let i = 0; i < 20; i++) {
      const phase = (engine.getSnapshot(sessionId)!.game as X01Game).phase
      if (phase !== 'bulloff') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    expect((engine.getSnapshot(sessionId)!.game as X01Game).phase).toBe('game')
  })

  it('a bot seat in a non-x01 session never crashes session creation or push: the scheduler no-ops', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    // Bots are x01-only per the spec; the lobby guards this at the source (see
    // lobby/service.test.ts), but the scheduler must defend itself too — a synchronous throw
    // inside push() (called from createWithSeats itself, here) must never happen regardless.
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'atc',
      config: atcModule.defaultConfig,
      seats: [seat('Bot Lvl 5', 'chris', null, { level: 5 })],
    })
    expect(engine.getSnapshot(sessionId)?.status).toBe('active')
    // Plenty of time for the scheduler to have tried (and failed) to drive it, if it were going to
    await vi.advanceTimersByTimeAsync(20_000)
    expect(engine.getSnapshot(sessionId)?.status).toBe('active')
    // The game still works normally otherwise — nothing about the bot's presence broke it
    await engine.onUserAction(sessionId, 'chris', {
      type: 'add_dart',
      segment: { name: 'S20', number: 20, bed: 'Single', multiplier: 1 },
    })
    expect(engine.getSnapshot(sessionId)?.status).toBe('active')
  })

  it("a transient store failure during a bot's action never becomes an unhandled rejection, and the bot recovers", async () => {
    const push = vi.fn()
    const store = { ...makeStore(), appendEvent: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined) }
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
      seats: [seat('Bot Lvl 10', 'chris', null, { level: 10 })],
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      for (let i = 0; i < 500; i++) {
        const snap = engine.getSnapshot(sessionId)
        if (!snap || snap.status !== 'active') break
        await vi.advanceTimersByTimeAsync(5000)
      }
    } finally {
      process.off('unhandledRejection', unhandled)
    }
    expect(unhandled).not.toHaveBeenCalled()
    // The game still finished: the bot wasn't permanently stuck after the one failed attempt
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
  })

  it('a warn that itself throws inside the failure handler never becomes an unhandled rejection either', async () => {
    const push = vi.fn()
    const store = { ...makeStore(), appendEvent: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined) }
    // The logger itself fails on this call — the scenario the reviewer demonstrated: without a
    // try/catch around the catch body, this throw becomes a second unhandled rejection, the
    // exact class of crash the outer catch was added to prevent, just one layer deeper.
    const warn = vi.fn(() => {
      throw new Error('logger down too')
    })
    const engine = new SessionEngine(store, push, warn)
    await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
      seats: [seat('Bot Lvl 10', 'chris', null, { level: 10 })],
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      // Enough time for the bot's first (failing) action attempt to run; the retry it would
      // normally schedule never happens here since the throwing warn aborts before reaching
      // it, but nothing must crash as a result.
      await vi.advanceTimersByTimeAsync(5000)
    } finally {
      process.off('unhandledRejection', unhandled)
    }
    expect(warn).toHaveBeenCalled()
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('a bot under double-in aims at a double (not T20) until it opens, and the leg still finishes', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      // A tight bot (level 10) at a low start score: before the fix this never opens (it
      // always aimed at T20, which never counts under double-in) and the leg runs out the
      // clock at maxRounds with the bot stuck on its starting score.
      config: { ...x01Module.defaultConfig, startScore: 41, inMode: 'double', outMode: 'double', botSpeed: 'fast' },
      seats: [seat('Bot Lvl 10', 'chris', null, { level: 10 })],
    })
    for (let i = 0; i < 500; i++) {
      const snap = engine.getSnapshot(sessionId)
      if (!snap || snap.status !== 'active') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    const snap = engine.getSnapshot(sessionId)
    expect(snap?.status).toBe('finished')
    // A round-limit timeout (the bug: never opening, so every leg runs out the clock) finishes
    // with the leg count unchanged (0); actually checking out legs (firstTo, default 3) proves
    // it opened and played normally instead.
    expect((snap?.game as X01Game).legs[0]).toBeGreaterThan(0)
    expect((snap?.game as X01Game).winner).toBe(0)
  })

  it('a game with two bots and no human plays to completion', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
      seats: [{ ...seat('Bot Lvl 8', 'chris', null, { level: 8 }) }, { ...seat('Bot Lvl 3', 'chris', null, { level: 3 }) }],
    })
    for (let i = 0; i < 1000; i++) {
      const snap = engine.getSnapshot(sessionId)
      if (!snap || snap.status !== 'active') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
  })
})
