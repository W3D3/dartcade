import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import type { Seat } from '../session/types.js'
import type { X01Game } from '../schema/game-ws.js'
import { x01Module } from '../games/x01.js'

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
      seats: [
        { ...seat('Bot Lvl 10', 'chris', null, { level: 10 }) },
        { ...seat('Bot Lvl 10', 'chris', null, { level: 10 }) },
      ],
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

  it('a game with two bots and no human plays to completion', async () => {
    const push = vi.fn()
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
      seats: [
        { ...seat('Bot Lvl 8', 'chris', null, { level: 8 }) },
        { ...seat('Bot Lvl 3', 'chris', null, { level: 3 }) },
      ],
    })
    for (let i = 0; i < 1000; i++) {
      const snap = engine.getSnapshot(sessionId)
      if (!snap || snap.status !== 'active') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
  })
})
