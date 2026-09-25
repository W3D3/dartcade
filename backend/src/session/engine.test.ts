import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionEngine } from './engine.js'
import type { EngineStore } from './engine.js'
import type { BoardEvent } from './types.js'

function makeStore(): EngineStore {
  return {
    insertSession: vi.fn().mockResolvedValue(undefined),
    getActiveSessions: vi.fn().mockResolvedValue([]),
    getBridgeEventsForBoard: vi.fn().mockResolvedValue([]),
    setSessionFinished: vi.fn().mockResolvedValue(undefined),
  }
}

const push = vi.fn()

function makeEngine() {
  return new SessionEngine(makeStore(), push)
}

beforeEach(() => { vi.clearAllMocks() })

describe('create', () => {
  it('rejects unknown game', async () => {
    const engine = makeEngine()
    await expect(engine.create('board-1', 'unknown', {}, [{ name: 'Alice' }]))
      .rejects.toThrow(/unknown game/)
  })

  it('rejects duplicate active session for same board', async () => {
    const engine = makeEngine()
    await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await expect(engine.create('board-1', 'atc', {}, [{ name: 'Bob' }]))
      .rejects.toThrow(/active session/)
  })

  it('returns a sessionId', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
  })
})

describe('onBridgeEvent', () => {
  it('no-ops when no active session for boardId', async () => {
    const engine = makeEngine()
    await engine.onBridgeEvent('unknown-board', 'dart.detected', {}, new Date())
    expect(push).not.toHaveBeenCalled()
  })

  it('pushes snapshot after visit.opened', async () => {
    const engine = makeEngine()
    await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    expect(push).toHaveBeenCalledWith(expect.any(String))
  })

  it('flushes openVisitEvents on takeout.finished', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'takeout.finished', { visit_id: 'v1', trigger: 'numThrows.zero', duration_ms: 1000 }, new Date())
    const session = engine.getSession(sessionId)
    expect(session?.openVisitEvents).toHaveLength(0)
  })

  it('dart.corrected replaces dart at index in openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    const visitId = 'v1'
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: visitId }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: visitId, index: 0,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 1,
    }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.corrected', {
      visit_id: visitId, index: 0,
      dart: { segment: { number: 5, bed: 'Single', multiplier: 1, name: 'S5' }, score: 5 },
      previous: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 2,
    }, new Date())
    const session = engine.getSession(sessionId)!
    const dartEv = session.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(dartEv.data.dart.segment.number).toBe(5)
  })

  it('board.resync clears openVisitEvents, preserves committedState', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'board.resync', { throws: [] }, new Date())
    const session = engine.getSession(sessionId)!
    expect(session.openVisitEvents).toHaveLength(0)
    expect(session.currentState).toEqual(session.committedState)
  })
})

describe('onUserAction', () => {
  it('undo_dart removes last dart.detected from openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0,
      dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 },
      source_seq: 1,
    }, new Date())
    await engine.onUserAction(sessionId, { type: 'undo_dart' })
    const session = engine.getSession(sessionId)!
    const darts = session.openVisitEvents.filter(e => e.kind === 'dart.detected')
    expect(darts).toHaveLength(0)
  })

  it('correct_dart replaces segment at visitIndex', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3 },
      source_seq: 1,
    }, new Date())
    await engine.onUserAction(sessionId, {
      type: 'correct_dart', visitIndex: 0,
      segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' },
    })
    const session = engine.getSession(sessionId)!
    const d = session.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart.segment.number).toBe(1)
  })
})

describe('getSnapshot', () => {
  it('returns snapshot with currentVisitDarts from openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0,
      dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 },
      source_seq: 1,
    }, new Date())
    const snap = engine.getSnapshot(sessionId)!
    expect(snap.type).toBe('snapshot')
    expect((snap.game as any).currentVisitDarts).toHaveLength(1)
  })
})
