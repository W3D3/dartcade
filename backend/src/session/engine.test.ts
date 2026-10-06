import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SessionEngine, type SnapshotView } from './engine.js'
import { ActiveSessionError, BoardBusyError } from './errors.js'
import type { EngineStore } from './engine.js'
import type { StoredGameSession } from '../db/queries.js'
import type { X01Game } from '../schema/game-ws.js'
import { x01Module } from '../games/x01.js'
import { atcModule } from '../games/atc.js'
import type { Seat } from './types.js'
import { seededRng, shuffle } from './rng.js'

const seat = (name: string, controllerUserId: string, boardId: string | null, userId: string | null = controllerUserId): Seat => ({
  name,
  userId,
  controllerUserId,
  boardId,
  boardName: boardId,
  bot: null,
})

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
  } satisfies EngineStore
}

const push = vi.fn()

function makeEngine() {
  return new SessionEngine(makeStore(), push)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('create', () => {
  it('rejects unknown game', async () => {
    const engine = makeEngine()
    await expect(engine.create('user-1', 'board-1', 'unknown', {}, [{ name: 'Alice' }])).rejects.toThrow(/unknown game/)
  })

  it('rejects duplicate active session for same board', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await expect(engine.create('user-2', 'board-1', 'atc', {}, [{ name: 'Bob' }])).rejects.toThrow(
      /active session already exists for board/,
    )
  })

  it('allows one active session per user, with or without a board', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }])
    const err = await engine.create('user-1', 'board-2', 'atc', {}, [{ name: 'Alice' }]).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ActiveSessionError)
    expect(err instanceof ActiveSessionError && err.sessionId).toBe(sessionId)
    // other users are unaffected
    await expect(engine.create('user-2', null, 'atc', {}, [{ name: 'Bob' }])).resolves.toBeDefined()
    expect(engine.getSessionByUser('user-1')?.id).toBe(sessionId)
  })

  it('frees the slot once the session ends', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.deleteSession(sessionId)
    expect(store.abortSession).toHaveBeenCalledWith(sessionId, expect.any(Date), null)
    expect(engine.getSessionByUser('user-1')).toBeUndefined()
    await expect(engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])).resolves.toBeDefined()
  })

  it('rejects a config the game module deems invalid, without persisting', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    await expect(
      engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'Alice' }]),
    ).rejects.toThrow(/invalid config: bull off needs at least two players/)
    expect(store.insertSession).not.toHaveBeenCalled()
  })

  it('lets only one of two concurrent creates by the same user through', async () => {
    const engine = makeEngine()
    const results = await Promise.allSettled([
      engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }]),
      engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }]),
    ])
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find(r => r.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(ActiveSessionError)
    expect(engine.getAllSessions()).toHaveLength(1)
  })

  it('lets only one of two concurrent creates on the same board through', async () => {
    const engine = makeEngine()
    const results = await Promise.allSettled([
      engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }]),
      engine.create('user-2', 'board-1', 'atc', {}, [{ name: 'Bob' }]),
    ])
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find(r => r.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(BoardBusyError)
    expect(engine.getAllSessions()).toHaveLength(1)
  })

  it('frees the reserved slots when storing the session fails', async () => {
    const store = makeStore()
    store.insertSession.mockRejectedValueOnce(new Error('db down'))
    const engine = new SessionEngine(store, push)
    await expect(engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])).rejects.toThrow('db down')
    expect(engine.getSessionByUser('user-1')).toBeUndefined()
    expect(engine.getSessionByBoard('board-1')).toBeUndefined()
    expect(engine.getAllSessions()).toHaveLength(0)
    await expect(engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])).resolves.toBeDefined()
  })

  it("gives a local game's seats the board's name", async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }, { name: 'Bob' }], 'Living room')
    expect(engine.getSession(sessionId)?.seats.map(s => s.boardName)).toEqual(['Living room', 'Living room'])
  })

  it('returns a sessionId', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
  })
})

describe('onBridgeEvent', () => {
  it('no-ops when no active session for boardId', async () => {
    const engine = makeEngine()
    await engine.onBridgeEvent('unknown-board', 'dart.detected', {})
    expect(push).not.toHaveBeenCalled()
  })

  it('warns about dart events whose data does not match the bridge schema, and ignores them', async () => {
    const warn = vi.fn()
    const engine = new SessionEngine(makeStore(), push, warn)
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      source_seq: 1,
      dart: { segment: { name: 'X1', number: 1, bed: 'Weird', multiplier: 1 }, score: 1 },
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dart.detected'), expect.anything())
    expect(engine.getSession(sessionId)!.openVisitEvents.filter(e => e.kind === 'dart.detected')).toHaveLength(0)
  })

  it('pushes snapshot after visit.opened', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    expect(push).toHaveBeenCalledWith(expect.any(String))
  })

  it('flushes openVisitEvents on takeout.finished', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'takeout.finished', { visit_id: 'v1', trigger: 'numThrows.zero', duration_ms: 1000 })
    const session = engine.getSession(sessionId)
    expect(session?.openVisitEvents).toHaveLength(0)
  })

  it('dart.corrected replaces dart at index in openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    const visitId = 'v1'
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: visitId })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: visitId,
      index: 0,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 1,
    })
    await engine.onBridgeEvent('board-1', 'dart.corrected', {
      visit_id: visitId,
      index: 0,
      dart: { segment: { number: 5, bed: 'Single', multiplier: 1, name: 'S5' }, score: 5 },
      previous: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 2,
    })
    const session = engine.getSession(sessionId)!
    const dartEv = session.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(dartEv.data.dart.segment.number).toBe(5)
  })

  it('board.resync clears openVisitEvents, preserves committedState', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'board.resync', { throws: [] })
    const session = engine.getSession(sessionId)!
    expect(session.openVisitEvents).toHaveLength(0)
    expect(session.currentState).toEqual(session.committedState)
  })

  describe('the visit that wins the game', () => {
    const D20 = { name: 'D20', number: 20, bed: 'Double', multiplier: 2 }
    async function checkedOut() {
      const store = makeStore()
      const engine = new SessionEngine(store, push)
      const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, startScore: 40, firstTo: 1 }, [
        { name: 'Alice' },
        { name: 'Bob' },
      ])
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
      await engine.onBridgeEvent('board-1', 'dart.detected', { visit_id: 'v1', index: 0, source_seq: 1, dart: { segment: D20, score: 40 } })
      return { store, engine, sessionId }
    }

    it("waits for Finish: the board's takeout, a new visit and darts are dropped unlogged", async () => {
      const { store, engine, sessionId } = await checkedOut()
      expect(engine.getSnapshot(sessionId)!.finishPending).toBe(true)
      const logged = store.appendEvent.mock.calls.length
      await engine.onBridgeEvent('board-1', 'takeout.finished', {})
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v2' })
      await engine.onBridgeEvent('board-1', 'dart.detected', { visit_id: 'v2', index: 0, source_seq: 2, dart: { segment: D20, score: 40 } })
      await engine.onBridgeEvent('board-1', 'visit.cleared', {})
      expect(store.appendEvent).toHaveBeenCalledTimes(logged)
      expect(store.finishSession).not.toHaveBeenCalled()
      expect(engine.getSnapshot(sessionId)!.game.currentVisitDarts).toHaveLength(1)
    })

    it('Finish ends the game', async () => {
      const { store, engine, sessionId } = await checkedOut()
      await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
      expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
        expect.objectContaining({ placement: 1 }),
        expect.objectContaining({ placement: 2 }),
      ])
      expect(engine.getSnapshot(sessionId)!.status).toBe('finished')
    })

    it('a correction that no longer wins lets the board take out again', async () => {
      const { engine, sessionId } = await checkedOut()
      await engine.onUserAction(sessionId, 'user-1', {
        type: 'correct_dart',
        visitIndex: 0,
        segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 },
      })
      expect(engine.getSnapshot(sessionId)!.finishPending).toBe(false)
      await engine.onBridgeEvent('board-1', 'takeout.finished', {})
      expect((engine.getSnapshot(sessionId)!.game as X01Game).currentPlayer).toBe(1)
    })
  })
})

describe('onUserAction', () => {
  it('undo_dart removes last dart.detected from openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 },
      source_seq: 1,
    })
    await engine.onUserAction(sessionId, 'user-1', { type: 'undo_dart' })
    const session = engine.getSession(sessionId)!
    const darts = session.openVisitEvents.filter(e => e.kind === 'dart.detected')
    expect(darts).toHaveLength(0)
  })

  it('correct_dart replaces segment at visitIndex', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 1,
    })
    await engine.onUserAction(sessionId, 'user-1', {
      type: 'correct_dart',
      visitIndex: 0,
      segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' },
    })
    const session = engine.getSession(sessionId)!
    const d = session.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart.segment.number).toBe(1)
  })

  it('correct_dart drops the camera position, which no longer matches the segment', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      source_seq: 1,
      dart: {
        segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' },
        score: 3,
        coords: { x: 0.1, y: 0.2 },
        polar: { r: 0.22, theta_deg: 63 },
      },
    })
    await engine.onUserAction(sessionId, 'user-1', {
      type: 'correct_dart',
      visitIndex: 0,
      segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' },
    })
    const d = engine.getSession(sessionId)!.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart).not.toHaveProperty('coords')
    expect(d.data.dart).not.toHaveProperty('polar')
  })

  it('correct_dart with coords moves the dart to that spot', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      source_seq: 1,
      dart: {
        segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' },
        score: 3,
        coords: { x: 0.1, y: -0.3 },
        polar: { r: 0.32, theta_deg: -72 },
      },
    })
    await engine.onUserAction(sessionId, 'user-1', {
      type: 'correct_dart',
      visitIndex: 0,
      segment: { number: 20, bed: 'Triple', multiplier: 3, name: 'T20' },
      coords: { x: 0, y: 0.6 },
    })
    const d = engine.getSession(sessionId)!.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart).toMatchObject({ score: 60, coords: { x: 0, y: 0.6 }, polar: { r: 0.6, theta_deg: 90 } })
  })

  it('does not count bull off darts; the first game dart counts for the bull off winner', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [
      { name: 'Alice' },
      { name: 'Bob' },
    ])
    const dart = (r: number) => ({
      visit_id: 'v',
      index: 0,
      source_seq: 1,
      dart: { segment: { number: 25, bed: 'Single', multiplier: 1, name: '25' }, score: 25, polar: { r, theta_deg: 0 } },
    })
    for (const r of [0.2, 0.05]) {
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' })
      await engine.onBridgeEvent('board-1', 'dart.detected', dart(r))
      await engine.onBridgeEvent('board-1', 'takeout.finished', {})
    }
    let session = engine.getSession(sessionId)!
    expect(session.totalDarts).toEqual([0, 0])
    expect(session.totalVisits).toEqual([0, 0])

    // Bob won the bull off; the next visit is the game's first
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'g1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', dart(0.5))
    await engine.onBridgeEvent('board-1', 'takeout.finished', {})
    session = engine.getSession(sessionId)!
    expect(session.totalDarts).toEqual([0, 1])
    expect(session.totalVisits).toEqual([0, 1])
  })

  it('passes other actions to the game module (bull off start)', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [
      { name: 'Alice' },
      { name: 'Bob' },
    ])
    const dart = (r: number) => ({
      visit_id: 'v',
      index: 0,
      source_seq: 1,
      dart: { segment: { number: 25, bed: 'Single', multiplier: 1, name: '25' }, score: 25, polar: { r, theta_deg: 0 } },
    })
    for (const r of [0.2, 0.05]) {
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' })
      await engine.onBridgeEvent('board-1', 'dart.detected', dart(r))
      await engine.onBridgeEvent('board-1', 'takeout.finished', {})
    }
    await engine.onUserAction(sessionId, 'user-1', { type: 'bulloff_start' })
    const snap = engine.getSnapshot(sessionId)!
    expect((snap.game as any).phase).toBe('game')
    expect((snap.game as any).currentPlayer).toBe(1)
  })

  it('measures a manually entered bull off dart from its coordinates', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [
      { name: 'Alice' },
      { name: 'Bob' },
    ])
    await engine.onUserAction(sessionId, 'user-1', {
      type: 'add_dart',
      segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 },
      coords: { x: 0.03, y: 0.04 },
    })
    const bullOff = (engine.getSnapshot(sessionId)!.game as any).bullOff
    expect(bullOff.throws[0]).toEqual({ mm: 8.5, segment: '25', thetaDeg: expect.closeTo(53.13, 2), estimated: false })
  })
  const T20 = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } as const
  const S20 = { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 } as const
  const x01Cfg = { ...x01Module.defaultConfig, startScore: 101 }

  it('empty takeout records three misses and moves on', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', x01Cfg, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([3, 0])
    expect(engine.getSnapshot(sessionId)!.game.currentPlayer).toBe(1)
  })

  it('takeout after a bust records that visit, not misses', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([1, 0])
  })

  it('a busted visit takes no more darts', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect(engine.getSession(sessionId)!.totalDarts).toEqual([1, 0])
  })

  it('undo after a bust accepts darts again', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, 'user-1', { type: 'undo_dart' })
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect((engine.getSnapshot(sessionId)!.game as X01Game).scores).toEqual([21, 41])
  })

  it('empty takeout is ignored during the bull off', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([0, 0])
    expect((engine.getSnapshot(sessionId)!.game as X01Game).phase).toBe('bulloff')
  })

  it('a win whose result fails to save still frees its players and board', async () => {
    const store = makeStore()
    store.finishSession.mockRejectedValue(new Error('db down'))
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Cfg, startScore: 40, firstTo: 1 }, [{ name: 'A' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: { name: 'D20', number: 20, bed: 'Double', multiplier: 2 } })
    await expect(engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })).rejects.toThrow('db down')
    expect(engine.getSessionByUser('user-1')).toBeUndefined()
    expect(engine.getSessionByBoard('board-1')).toBeUndefined()
  })

  it('empty takeout is ignored after a win', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 40, firstTo: 1 }, [{ name: 'A' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: { name: 'D20', number: 20, bed: 'Double', multiplier: 2 } })
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [expect.objectContaining({ placement: 1 })])
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    expect(engine.getSession(sessionId)!.totalVisits).toEqual([1])
  })
})

describe('rebuild', () => {
  it('aborts a session whose events fail to load, and restores the other', async () => {
    const good: StoredGameSession = {
      id: 'good-1',
      owner_user_id: 'user-1',
      board_db_id: null,
      game_id: 'atc',
      game_version: atcModule.version,
      rng_seed: 1,
      config: atcModule.defaultConfig,
      created_at: new Date(),
      players: [{ name: 'Alice', user_id: 'user-1', controller_user_id: 'user-1', board_db_id: null, board_name: null, bot_level: null }],
      lobby_id: null,
      lobby_name: null,
    }
    const bad: StoredGameSession = {
      id: 'bad-1',
      owner_user_id: 'user-2',
      board_db_id: null,
      game_id: 'atc',
      game_version: atcModule.version,
      rng_seed: 1,
      config: atcModule.defaultConfig,
      created_at: new Date(),
      players: [{ name: 'Bob', user_id: 'user-2', controller_user_id: 'user-2', board_db_id: null, board_name: null, bot_level: null }],
      lobby_id: null,
      lobby_name: null,
    }
    const warn = vi.fn()
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([good, bad])
    store.getSessionEvents.mockImplementation((id: string) => (id === 'bad-1' ? Promise.reject(new Error('boom')) : Promise.resolve([])))
    const engine = new SessionEngine(store, push, warn)

    await expect(engine.rebuild()).resolves.toBeUndefined()

    expect(engine.getSession('good-1')).toBeDefined()
    expect(engine.getSessionByUser('user-1')?.id).toBe('good-1')
    expect(engine.getSession('bad-1')).toBeUndefined()
    expect(store.abortSession).toHaveBeenCalledWith('bad-1', expect.any(Date), null)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rebuild'), expect.objectContaining({ sessionId: 'bad-1' }))
  })
})

describe('getSnapshot', () => {
  it('returns snapshot with currentVisitDarts from openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' })
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1',
      index: 0,
      dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 },
      source_seq: 1,
    })
    const snap = engine.getSnapshot(sessionId)!
    expect(snap.type).toBe('snapshot')
    expect(snap.gameId).toBe('atc')
    expect((snap.game as any).currentVisitDarts).toHaveLength(1)
  })

  it('shows a bot seat in the snapshot, and a human seat as bot: null', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [seat('Christoph', 'chris', 'living'), { ...seat('Bot Lvl 3', 'chris', null, null), bot: { level: 3 } }],
    })
    const snap = engine.getSnapshot(sessionId)
    expect(snap?.seats[0].bot).toBeNull()
    expect(snap?.seats[1].bot).toEqual({ level: 3 })
  })
})

describe('createWithSeats', () => {
  it('indexes every seat board and every controller', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b'), seat('Guest', 'host', 'board-a', null)],
    })
    expect(engine.getSessionByBoard('board-a')?.id).toBe(sessionId)
    expect(engine.getSessionByBoard('board-b')?.id).toBe(sessionId)
    expect(engine.getSessionByUser('lena')?.id).toBe(sessionId)
    expect(engine.getSession(sessionId)?.players).toEqual([{ name: 'Host' }, { name: 'Lena' }, { name: 'Guest' }])
  })

  it("stores each seat's account, controller and board", async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'atc',
      config: {},
      seats: [seat('Host', 'host', 'board-a'), seat('Guest', 'host', null, null)],
    })
    expect(store.insertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_user_id: 'host',
        board_db_id: null,
        players: [
          { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'board-a', bot_level: null },
          { name: 'Guest', user_id: null, controller_user_id: 'host', board_db_id: null, bot_level: null },
        ],
      }),
    )
  })

  it('refuses a board another game uses', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-b', 'atc', {}, [{ name: 'Alice' }])
    const err = await engine
      .createWithSeats({ ownerUserId: 'host', gameId: 'atc', config: {}, seats: [seat('Host', 'host', 'board-b')] })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BoardBusyError)
  })

  it('refuses a controller who is already in a game', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('lena', null, 'atc', {}, [{ name: 'Lena' }])
    const err = await engine
      .createWithSeats({ ownerUserId: 'host', gameId: 'atc', config: {}, seats: [seat('Host', 'host', null), seat('Lena', 'lena', null)] })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ActiveSessionError)
    expect(err instanceof ActiveSessionError && [err.sessionId, err.userId]).toEqual([sessionId, 'lena'])
  })

  it('frees every board and controller once the game ends', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'atc',
      config: {},
      seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b')],
    })
    await engine.deleteSession(sessionId)
    expect(engine.getSessionByBoard('board-b')).toBeUndefined()
    expect(engine.getSessionByUser('lena')).toBeUndefined()
  })

  it("tells the started listener every seated account, owner and guest's controller alike", async () => {
    const started = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, undefined, started)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'atc',
      config: {},
      seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b'), seat('Guest', 'host', 'board-a', null)],
    })
    expect(started).toHaveBeenCalledWith({ sessionId, userIds: ['host', 'lena'] })
  })
})

const dartData = (index: number, name: string, number: number, multiplier: number, bed = 'SingleOuter') => ({
  visit_id: 'v',
  index,
  source_seq: index,
  dart: { segment: { name, number, bed, multiplier }, score: number * multiplier },
})

async function twoBoardGame(store = makeStore(), notify = vi.fn()) {
  const engine = new SessionEngine(store, push, undefined, notify)
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: 'host',
    gameId: 'x01',
    config: { ...x01Module.defaultConfig, startScore: 301 },
    seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b')],
  })
  return { engine, sessionId, store, notify }
}

async function visit(engine: SessionEngine, boardId: string, darts: [string, number, number, string][]) {
  for (const [i, [name, number, multiplier, bed]] of darts.entries()) {
    await engine.onBridgeEvent(boardId, 'dart.detected', dartData(i, name, number, multiplier, bed))
  }
  await engine.onBridgeEvent(boardId, 'takeout.finished', {})
}
const T20: [string, number, number, string] = ['T20', 20, 3, 'Triple']
const S1: [string, number, number, string] = ['S1', 1, 1, 'SingleOuter']

describe('routing board events', () => {
  it('counts darts from the board of the seat that is up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.scores[0]).toBe(241)
  })

  it("drops darts from another board, unlogged, and tells that board's players", async () => {
    const { engine, sessionId, store, notify } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect(store.appendEvent).not.toHaveBeenCalled()
    expect((engine.getSnapshot(sessionId)?.game as X01Game).scores).toEqual([301, 301])
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], {
      type: 'notice',
      code: 'not_your_turn',
      boardId: 'board-b',
      throwerName: 'Host',
      throwerBoard: 'board-a',
    })
  })

  it('names the thrower\'s board "Board" when its name is gone', async () => {
    const notify = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, notify)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, startScore: 301 },
      seats: [{ ...seat('Host', 'host', 'board-a'), boardName: null }, seat('Lena', 'lena', 'board-b')],
    })
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], expect.objectContaining({ throwerBoard: 'Board' }))
  })

  it('ignores a takeout on a board that is not up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'S1', 1, 1))
    await engine.onBridgeEvent('board-b', 'takeout.finished', {})
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.currentPlayer).toBe(0)
    expect(game.currentVisitDarts).toHaveLength(1)
  })

  it('passes the turn to the next board on takeout; its darts count and bust without a visit.opened', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'visit.opened', { visit_id: 'early' }) // dropped: not Lena's turn yet
    await visit(engine, 'board-a', [S1]) // host 300
    await visit(engine, 'board-b', [T20, T20, T20]) // Lena 121
    expect((engine.getSnapshot(sessionId)?.game as X01Game).scores).toEqual([300, 121])
    await visit(engine, 'board-a', [S1]) // host 299
    await visit(engine, 'board-b', [T20, T20]) // Lena would leave 1 on double out: bust, back to 121
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.scores).toEqual([299, 121])
    expect(game.currentPlayer).toBe(0)
  })

  it('logs which board an accepted event came from', async () => {
    const { engine, store } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'S1', 1, 1))
    expect(store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ board_db_id: 'board-a', source: 'board' }))
  })

  it("keeps each board's status and re-pushes on bridge presence changes", async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'board.status', { status: 'Throw', running: true, event: 'x' })
    expect(engine.getSession(sessionId)?.boardStatus.get('board-b')?.status).toBe('Throw')
    push.mockClear()
    engine.onBoardPresence('board-b')
    expect(push).toHaveBeenCalledWith(sessionId)
  })
})

describe('rebuild with seats', () => {
  it("restores each seat's controller and board", async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([
      {
        id: 's1',
        owner_user_id: 'host',
        board_db_id: null,
        game_id: 'atc',
        game_version: 1,
        rng_seed: 1,
        config: {},
        created_at: new Date(),
        players: [
          { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'board-a', board_name: 'Living room', bot_level: null },
          { name: 'Lena', user_id: 'lena', controller_user_id: null, board_db_id: 'board-b', board_name: "Lena's place", bot_level: null },
        ],
        lobby_id: null,
        lobby_name: null,
      } satisfies StoredGameSession,
    ])
    const engine = new SessionEngine(store, push)
    await engine.rebuild()
    const s = engine.getSession('s1')
    expect(s?.seats).toEqual([
      { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: 'board-a', boardName: 'Living room', bot: null },
      // A deleted controller falls back to the host, so the seat can still be played
      { name: 'Lena', userId: 'lena', controllerUserId: 'host', boardId: 'board-b', boardName: "Lena's place", bot: null },
    ])
    expect(engine.getSessionByBoard('board-b')?.id).toBe('s1')
  })
})

describe('rebuild resumes a bot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a session rebuilt at startup with a bot seat up throws on its own, without any human action', async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([
      {
        id: 's1',
        owner_user_id: 'chris',
        board_db_id: null,
        game_id: 'x01',
        game_version: 1,
        rng_seed: 1,
        config: { ...x01Module.defaultConfig, startScore: 121, botSpeed: 'fast' },
        created_at: new Date(),
        players: [{ name: 'Bot Lvl 10', user_id: null, controller_user_id: 'chris', board_db_id: null, board_name: null, bot_level: 10 }],
        lobby_id: null,
        lobby_name: null,
      } satisfies StoredGameSession,
    ])
    const engine = new SessionEngine(store, push)
    // rebuild() runs with no watcher ever having opened the game (push is a no-op mock here,
    // same as a real restart before any browser reconnects) — only the scheduler itself can
    // move this game forward.
    await engine.rebuild()
    expect(engine.getSession('s1')?.status).toBe('active')
    for (let i = 0; i < 500; i++) {
      const snap = engine.getSnapshot('s1')
      if (!snap || snap.status !== 'active') break
      await vi.advanceTimersByTimeAsync(5000)
    }
    expect(engine.getSnapshot('s1')?.status).toBe('finished')
  })
})

describe('pushes only what changed something', () => {
  it('does not push a refused action', async () => {
    const { engine, sessionId } = await twoBoardGame()
    push.mockClear()
    await engine.onUserAction(sessionId, 'lena', { type: 'takeout' })
    expect(push).not.toHaveBeenCalled()
  })

  it('does not push a board event from a board that is not up', async () => {
    const { engine } = await twoBoardGame()
    push.mockClear()
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'S5', 5, 1))
    expect(push).not.toHaveBeenCalled()
  })

  it('does not push input after the game ended', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    push.mockClear()
    await engine.onUserAction(sessionId, 'host', {
      type: 'add_dart',
      segment: { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 },
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('still pushes an accepted action', async () => {
    const { engine, sessionId } = await twoBoardGame()
    push.mockClear()
    await engine.onUserAction(sessionId, 'host', {
      type: 'add_dart',
      segment: { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 },
    })
    expect(push).toHaveBeenCalledWith(sessionId)
  })
})

describe('onUserAction authorization', () => {
  it("refuses another player's action without logging it", async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    const res = await engine.onUserAction(sessionId, 'lena', {
      type: 'add_dart',
      segment: { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 },
    })
    expect(res).toEqual({ ok: false, code: 'forbidden' })
    expect(store.appendEvent).not.toHaveBeenCalled()
  })

  it('logs a forfeit with the seats it covers', async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'forfeit', data: { type: 'forfeit', seats: [1] } }))
  })

  it("still lets a local game's owner do everything", async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [
      { name: 'A' },
      { name: 'B' },
    ])
    await engine.onBridgeEvent('board-1', 'dart.detected', dartData(0, 'Bull', 25, 2, 'Double'))
    expect(await engine.onUserAction(sessionId, 'user-1', { type: 'bulloff_skip' })).toEqual({ ok: true })
  })
})

describe('forfeit', () => {
  it('finishes the game with the forfeiting seats last', async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    await engine.onBridgeEvent('board-a', 'takeout.finished', {})
    await engine.onUserAction(sessionId, 'host', { type: 'forfeit' })
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
      expect.objectContaining({ placement: 2, forfeited: true }),
      expect.objectContaining({ placement: 1, forfeited: false }),
    ])
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
    expect(engine.getSessionByUser('lena')).toBeUndefined()
  })

  it("rolls back the open visit's darts from whoever is up, not the forfeiting seat", async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    // host commits a one-dart visit, handing the turn to lena
    await visit(engine, 'board-a', [S1])
    // lena is now up and throws two darts, left open (no takeout yet)
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(1, 'T20', 20, 3, 'Triple'))
    // host forfeits their own seat; lena's open darts must be discarded, not kept against her
    await engine.onUserAction(sessionId, 'host', { type: 'forfeit' })
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
      expect.objectContaining({ stats: expect.objectContaining({ dartsThrown: 1 }) }),
      expect.objectContaining({ stats: expect.objectContaining({ dartsThrown: 0 }) }),
    ])
  })

  it('in a 2v2, a forfeit places the whole team last; only the forfeiting seat is marked forfeited', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'a1',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, format: 'teams', teams: [0, 1, 0, 1] },
      seats: [seat('A1', 'a1', null), seat('B1', 'b1', null), seat('A2', 'a2', null), seat('B2', 'b2', null)],
    })
    await engine.onUserAction(sessionId, 'a2', { type: 'forfeit' })
    // Places are counted among the two teams (1st and 2nd), not among the four seats:
    // Team B is placed 1st, Team A (A2's team) 2nd — only A2 itself is flagged forfeited
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
      expect.objectContaining({ placement: 2, forfeited: false }),
      expect.objectContaining({ placement: 1, forfeited: false }),
      expect.objectContaining({ placement: 2, forfeited: true }),
      expect.objectContaining({ placement: 1, forfeited: false }),
    ])
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
  })

  it('a forfeit logged before a crash finishes the game on rebuild', async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([
      {
        id: 's1',
        owner_user_id: 'host',
        board_db_id: null,
        game_id: 'atc',
        game_version: 1,
        rng_seed: 1,
        config: {},
        created_at: new Date(),
        players: [
          { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'a', board_name: null, bot_level: null },
          { name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: 'b', board_name: null, bot_level: null },
        ],
      },
    ])
    store.getSessionEvents.mockResolvedValue([
      { seq: 0, source: 'user', kind: 'forfeit', data: { type: 'forfeit', seats: [1] }, created_at: new Date() },
    ])
    await new SessionEngine(store, push).rebuild()
    expect(store.finishSession).toHaveBeenCalledWith('s1', expect.any(Date), [
      expect.objectContaining({ placement: 1, forfeited: false }),
      expect.objectContaining({ placement: 2, forfeited: true }),
    ])
  })
})

describe('getSnapshot per viewer', () => {
  it("describes each seat and the viewer's own seats", async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, {
      viewerUserId: 'lena',
      connectedUserIds: new Set(['host']),
      disconnectedAt: () => null,
      isBoardOnline: b => b === 'board-a',
    })
    expect(snap).toMatchObject({
      status: 'active',
      ownerUserId: 'host',
      mySeats: [1],
      seats: [
        {
          controllerUserId: 'host',
          userId: 'host',
          boardId: 'board-a',
          boardName: 'board-a',
          boardOnline: true,
          controllerConnected: true,
          forfeited: false,
        },
        {
          controllerUserId: 'lena',
          userId: 'lena',
          boardId: 'board-b',
          boardName: 'board-b',
          boardOnline: false,
          controllerConnected: false,
          forfeited: false,
        },
      ],
    })
  })

  it('shows the status of the board whose seat is up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'board.status', { status: 'Takeout', running: true, event: 'x' })
    await engine.onBridgeEvent('board-a', 'board.status', { status: 'Throw', running: true, event: 'y' })
    expect(engine.getSnapshot(sessionId)?.bmStatus?.status).toBe('Throw')
  })

  it('pushes an aborted snapshot before dropping the game', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const seen: (string | undefined)[] = []
    push.mockImplementation((id: string) => {
      seen.push(engine.getSnapshot(id)?.status)
    })
    await engine.deleteSession(sessionId)
    expect(seen).toEqual(['aborted'])
    push.mockReset()
  })
})

describe('bull off across boards', () => {
  const bull = (r: number) => ({
    visit_id: 'v',
    index: 0,
    source_seq: 1,
    dart: { segment: { number: 25, bed: 'Single', multiplier: 1, name: '25' }, score: 25, polar: { r, theta_deg: 0 } },
  })

  async function bullOffGame(boards: string[], notify = vi.fn()) {
    const store = makeStore()
    const engine = new SessionEngine(store, push, undefined, notify)
    const names = ['Host', 'Lena', 'Max']
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: { ...x01Module.defaultConfig, bullOff: 'wdc' },
      seats: boards.map((b, i) => seat(names[i], names[i].toLowerCase(), b)),
    })
    return { engine, sessionId, store, notify }
  }

  it("hands the first game visit to the winner's board; the loser's board is ignored", async () => {
    const { engine, sessionId, notify } = await bullOffGame(['board-a', 'board-b'])
    await engine.onBridgeEvent('board-a', 'visit.opened', { visit_id: 'v' })
    await engine.onBridgeEvent('board-a', 'dart.detected', bull(0.05))
    await engine.onBridgeEvent('board-a', 'takeout.finished', {})
    await engine.onBridgeEvent('board-b', 'visit.opened', { visit_id: 'v' })
    await engine.onBridgeEvent('board-b', 'dart.detected', bull(0.3))
    await engine.onBridgeEvent('board-b', 'takeout.finished', {})
    // Host won: Lena's board doesn't start the game
    notify.mockClear()
    await engine.onBridgeEvent('board-b', 'visit.opened', { visit_id: 'stray' })
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect((engine.getSnapshot(sessionId)?.game as X01Game).phase).toBe('bulloff')
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], expect.objectContaining({ code: 'not_your_turn' }))
    // Host's board starts it, and the first dart scores
    notify.mockClear()
    await engine.onBridgeEvent('board-a', 'visit.opened', { visit_id: 'g1' })
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.phase).toBe('game')
    expect(game.currentPlayer).toBe(0)
    expect(game.scores).toEqual([441, 501])
    expect(notify).not.toHaveBeenCalled()
  })

  it("rethrows a tie from the last thrower's board, not another board", async () => {
    const { engine, sessionId } = await bullOffGame(['board-a', 'board-b'])
    for (const [b, r] of [
      ['board-a', 0.2],
      ['board-b', 0.2],
    ] as const) {
      await engine.onBridgeEvent(b, 'visit.opened', { visit_id: 'v' })
      await engine.onBridgeEvent(b, 'dart.detected', bull(r))
      await engine.onBridgeEvent(b, 'takeout.finished', {})
    }
    // A tie: the rethrow starts with whoever threw last (Lena), on her board
    await engine.onBridgeEvent('board-a', 'visit.opened', { visit_id: 'x' })
    expect((engine.getSnapshot(sessionId)?.game as X01Game).bullOff?.result?.rethrow).toBe(true)
    await engine.onBridgeEvent('board-b', 'visit.opened', { visit_id: 'r' })
    const view = (engine.getSnapshot(sessionId)?.game as X01Game).bullOff
    expect(view?.result).toBeNull()
    expect(view?.currentPlayer).toBe(1)
  })

  it('a forfeit during the bull off ties the seats still in and puts the forfeited seat last', async () => {
    const { engine, sessionId, store } = await bullOffGame(['board-a', 'board-b', 'board-c'])
    await engine.onBridgeEvent('board-a', 'visit.opened', { visit_id: 'v' })
    await engine.onBridgeEvent('board-a', 'dart.detected', bull(0.05))
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
      expect.objectContaining({ placement: 1, forfeited: false }),
      expect.objectContaining({ placement: 3, forfeited: true }),
      expect.objectContaining({ placement: 1, forfeited: false }),
    ])
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
  })
})

describe('remote states in the snapshot', () => {
  const view = (over: Partial<SnapshotView> = {}): SnapshotView => ({
    viewerUserId: 'host',
    connectedUserIds: new Set(['host']),
    disconnectedAt: () => null,
    isBoardOnline: () => true,
    ...over,
  })
  const left = new Date('2026-10-02T18:00:00.000Z')

  it("says since when a seat's controller has the game closed", async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view({ disconnectedAt: u => (u === 'lena' ? left : null) }))
    expect(snap?.seats.map(s => [s.controllerConnected, s.disconnectedAt])).toEqual([
      [true, null],
      [false, '2026-10-02T18:00:00.000Z'],
    ])
  })

  it('has no time for a connected controller, even if an old one is around', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view({ disconnectedAt: () => left }))
    expect(snap?.seats[0]?.disconnectedAt).toBeNull()
    expect(snap?.seats[1]?.disconnectedAt).toBe('2026-10-02T18:00:00.000Z')
  })

  it('has no time for a controller who never opened the game', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view())
    expect(snap?.seats[1]).toMatchObject({ controllerConnected: false, disconnectedAt: null })
  })

  it("shows a bot seat as connected even when its host's own browser is gone", async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [{ ...seat('Bot Lvl 3', 'host', null, null), bot: { level: 3 } }, seat('Lena', 'lena', 'board-b')],
    })
    // The host (who controls the bot seat) has no open connection at all, and has been gone
    // a while — the bot keeps throwing server-side regardless, so it must still read connected.
    const snap = engine.getSnapshot(
      sessionId,
      view({ connectedUserIds: new Set(['lena']), disconnectedAt: u => (u === 'host' ? left : null) }),
    )
    expect(snap?.seats[0]).toMatchObject({ controllerConnected: true, disconnectedAt: null })
  })

  it('carries the lobby name: null outside a lobby', async () => {
    const { engine, sessionId } = await twoBoardGame()
    expect(engine.getSnapshot(sessionId)?.lobbyName).toBeNull()
    const session = engine.getSession(sessionId)!
    session.lobbyName = 'Friday darts'
    expect(engine.getSnapshot(sessionId)?.lobbyName).toBe('Friday darts')
  })

  it('names who is up in the not-your-turn notice; no board for a seat entering by hand', async () => {
    const notify = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, notify)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host',
      gameId: 'x01',
      config: x01Module.defaultConfig,
      seats: [seat('Host', 'host', null), seat('Lena', 'lena', 'board-b')],
    })
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], {
      type: 'notice',
      code: 'not_your_turn',
      boardId: 'board-b',
      throwerName: 'Host',
      throwerBoard: null,
    })
  })
})

describe('lobby games', () => {
  const lobbySeats = () => [seat('Christoph', 'chris', 'living'), seat('Lena', 'lena', 'lenas')]
  const lobbyGame = { ownerUserId: 'chris', gameId: 'x01', config: x01Module.defaultConfig, lobbyId: 'l1', lobbyName: "Christoph's lobby" }

  it('keeps the lobby on the game and in its snapshot', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    expect(store.insertSession).toHaveBeenCalledWith(expect.objectContaining({ lobby_id: 'l1', board_db_id: null }))
    expect(engine.getLobbySession('l1')?.id).toBe(sessionId)
    expect(engine.getSnapshot(sessionId)).toMatchObject({ lobbyId: 'l1', lobbyName: "Christoph's lobby" })
  })

  it('a local game has no lobby', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }])
    expect(engine.getSnapshot(sessionId)).toMatchObject({ lobbyId: null, lobbyName: null })
    expect(engine.getLobbySession('l1')).toBeUndefined()
  })

  it("shuffles the seats with the game's own seed for a random throw order", async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const seats = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => seat(n, n.toLowerCase(), null))
    await engine.createWithSeats({ ownerUserId: 'a', gameId: 'atc', config: {}, seats, shuffleSeats: true })
    const stored = store.insertSession.mock.calls[0][0]
    const names = stored.players.map((p: { name: string }) => p.name)
    expect(names).toEqual(shuffle(seats, seededRng(stored.rng_seed)).map(s => s.name))
    expect([...names].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('tells the started listener who is seated when a lobby game starts', async () => {
    const started = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, undefined, started)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    expect(started).toHaveBeenCalledWith({ sessionId, userIds: ['chris', 'lena'] })
  })

  it('tells the lobby when its game is won, with the results', async () => {
    const ended = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(ended).toHaveBeenCalledWith({
      sessionId,
      lobbyId: 'l1',
      gameId: 'x01',
      status: 'finished',
      abortedByUserId: null,
      results: [
        { name: 'Christoph', placement: 1, forfeited: false },
        { name: 'Lena', placement: 2, forfeited: true },
      ],
      teamGame: false,
      userIds: ['chris', 'lena'],
    })
    expect(engine.getLobbySession('l1')).toBeUndefined()
  })

  it('pushes the final (finished) snapshot before the game-ended listener runs', async () => {
    const ended = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(push).toHaveBeenCalledWith(sessionId)
    expect(ended).toHaveBeenCalledTimes(1)
    // The push callback fires with the finished snapshot already in place, strictly
    // before the game-ended listener (the lobby reset, the /ws/me pushes) runs
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
    const pushedAt = push.mock.invocationCallOrder.at(-1)
    const endedAt = ended.mock.invocationCallOrder.at(-1)
    expect(pushedAt).toBeDefined()
    expect(endedAt).toBeDefined()
    expect(pushedAt!).toBeLessThan(endedAt!)
  })

  it('records who aborted, and tells the lobby', async () => {
    const store = makeStore()
    const ended = vi.fn()
    const engine = new SessionEngine(store, push, undefined, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await engine.deleteSession(sessionId, 'chris')
    expect(store.abortSession).toHaveBeenCalledWith(sessionId, expect.any(Date), 'chris')
    expect(ended).toHaveBeenCalledWith({
      sessionId,
      lobbyId: 'l1',
      gameId: 'x01',
      status: 'aborted',
      abortedByUserId: 'chris',
      results: [],
      teamGame: false,
      userIds: ['chris', 'lena'],
    })
  })

  it("restores a lobby game after a restart, and tells the lobby about one it can't restore", async () => {
    const store = makeStore()
    const ended = vi.fn()
    const row = (id: string, owner: string | null): StoredGameSession => ({
      id,
      owner_user_id: owner,
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 1,
      config: x01Module.defaultConfig,
      created_at: new Date(),
      lobby_id: id === 'ok' ? 'l1' : 'l2',
      lobby_name: 'Friday darts',
      players: [
        { name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null, board_name: null, bot_level: null },
        { name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: null, board_name: null, bot_level: null },
      ],
    })
    // No owner: it can't be played on, so it's aborted
    store.getActiveSessions.mockResolvedValue([row('ok', 'chris'), row('gone', null)])
    const engine = new SessionEngine(store, push, undefined, undefined, ended)
    await engine.rebuild()
    expect(engine.getLobbySession('l1')).toMatchObject({ id: 'ok', lobbyId: 'l1', lobbyName: 'Friday darts' })
    expect(ended).toHaveBeenCalledWith({
      sessionId: 'gone',
      lobbyId: 'l2',
      gameId: 'x01',
      status: 'aborted',
      abortedByUserId: null,
      results: [],
      teamGame: false,
      userIds: ['chris', 'lena'],
    })
    expect(ended).toHaveBeenCalledTimes(1)
  })
  it('keeps going when the lobby listener throws: no double abort, no error to the caller', async () => {
    const store = makeStore()
    const warn = vi.fn()
    const ended = vi.fn(() => {
      throw new Error('lobby broke')
    })
    const row: StoredGameSession = {
      id: 'gone',
      owner_user_id: null,
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 1,
      config: x01Module.defaultConfig,
      created_at: new Date(),
      lobby_id: 'l2',
      lobby_name: 'Friday darts',
      players: [{ name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: null, board_name: null, bot_level: null }],
    }
    store.getActiveSessions.mockResolvedValue([row])
    const engine = new SessionEngine(store, push, warn, undefined, ended)
    await engine.rebuild()
    expect(store.abortSession).toHaveBeenCalledTimes(1)
    expect(ended).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('game-end listener failed', expect.objectContaining({ sessionId: 'gone' }))

    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await expect(engine.deleteSession(sessionId, 'chris')).resolves.not.toThrow()
  })

  it('a listener that rejects (not just throws) is logged too, never passed on', async () => {
    const warn = vi.fn()
    const ended = vi.fn(() => Promise.reject(new Error('push failed')))
    const engine = new SessionEngine(makeStore(), push, warn, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await expect(engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })).resolves.toEqual({ ok: true })
    expect(ended).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      'game-end listener failed',
      expect.objectContaining({ sessionId, error: expect.stringContaining('push failed') }),
    )
  })
})

describe('forgetting ended games', () => {
  const lobbyGame = {
    ownerUserId: 'chris',
    gameId: 'x01',
    config: x01Module.defaultConfig,
    lobbyId: 'l1',
    lobbyName: "Christoph's lobby",
    seats: [seat('Christoph', 'chris', 'living'), seat('Lena', 'lena', 'lenas')],
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a won game for keepFinishedMs, then forgets it', async () => {
    const forgotten = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, undefined, undefined, { keepFinishedMs: 60_000, forgotten })
    const { sessionId } = await engine.createWithSeats(lobbyGame)
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    vi.advanceTimersByTime(59_999)
    // Late watchers still get the final snapshot
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
    expect(engine.getAllSessions()).toHaveLength(1)
    expect(forgotten).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(engine.getSession(sessionId)).toBeUndefined()
    expect(engine.getSnapshot(sessionId)).toBeUndefined()
    expect(engine.getAllSessions()).toHaveLength(0)
    expect(forgotten).toHaveBeenCalledWith(sessionId)
  })

  it('keeps a won game for 10 minutes by default', async () => {
    const engine = new SessionEngine(makeStore(), push)
    const { sessionId } = await engine.createWithSeats(lobbyGame)
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    vi.advanceTimersByTime(10 * 60_000 - 1)
    expect(engine.getSession(sessionId)).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(engine.getSession(sessionId)).toBeUndefined()
  })

  it('forgets an aborted game right away, and a won game deleted before its time', async () => {
    const forgotten = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, undefined, undefined, { forgotten })
    const { sessionId } = await engine.createWithSeats(lobbyGame)
    await engine.deleteSession(sessionId)
    expect(forgotten).toHaveBeenCalledWith(sessionId)
    expect(engine.getSession(sessionId)).toBeUndefined()

    const won = await engine.createWithSeats(lobbyGame)
    await engine.onUserAction(won.sessionId, 'lena', { type: 'forfeit' })
    await engine.deleteSession(won.sessionId)
    expect(engine.getSession(won.sessionId)).toBeUndefined()
    expect(forgotten).toHaveBeenCalledTimes(2)
    // Its eviction timer went with it
    expect(vi.getTimerCount()).toBe(0)
  })

  it("finds a lobby's running game until it ends, and the lobby's next one after", async () => {
    const engine = makeEngine()
    const first = await engine.createWithSeats(lobbyGame)
    expect(engine.getLobbySession('l1')?.id).toBe(first.sessionId)
    expect(engine.getLobbySession('l2')).toBeUndefined()
    await engine.onUserAction(first.sessionId, 'lena', { type: 'forfeit' })
    // Won, but still kept for late watchers: no longer the lobby's game
    expect(engine.getSession(first.sessionId)?.status).toBe('finished')
    expect(engine.getLobbySession('l1')).toBeUndefined()
    const second = await engine.createWithSeats(lobbyGame)
    expect(engine.getLobbySession('l1')?.id).toBe(second.sessionId)
    // Forgetting the first game leaves the second one alone
    vi.runAllTimers()
    expect(engine.getSession(first.sessionId)).toBeUndefined()
    expect(engine.getLobbySession('l1')?.id).toBe(second.sessionId)
    await engine.deleteSession(second.sessionId)
    expect(engine.getLobbySession('l1')).toBeUndefined()
  })

  it("frees a lobby when its game can't be stored", async () => {
    const store = makeStore()
    store.insertSession.mockRejectedValueOnce(new Error('db down'))
    const engine = new SessionEngine(store, push)
    await expect(engine.createWithSeats(lobbyGame)).rejects.toThrow('db down')
    expect(engine.getLobbySession('l1')).toBeUndefined()
    await expect(engine.createWithSeats(lobbyGame)).resolves.toBeDefined()
  })
})
