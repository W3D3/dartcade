import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActiveSessionError, SessionEngine } from './engine.js'
import type { EngineStore } from './engine.js'
import type { BoardEvent } from './types.js'
import type { X01Game } from '../schema/game-ws.js'
import { x01Module } from '../games/x01.js'

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
    await expect(engine.create('user-1', 'board-1', 'unknown', {}, [{ name: 'Alice' }]))
      .rejects.toThrow(/unknown game/)
  })

  it('rejects duplicate active session for same board', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await expect(engine.create('user-2', 'board-1', 'atc', {}, [{ name: 'Bob' }]))
      .rejects.toThrow(/active session already exists for board/)
  })

  it('allows one active session per user, with or without a board', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }])
    const err = await engine.create('user-1', 'board-2', 'atc', {}, [{ name: 'Alice' }]).catch(e => e)
    expect(err).toBeInstanceOf(ActiveSessionError)
    expect(err.sessionId).toBe(sessionId)
    // other users are unaffected
    await expect(engine.create('user-2', null, 'atc', {}, [{ name: 'Bob' }])).resolves.toBeDefined()
    expect(engine.getSessionByOwner('user-1')?.id).toBe(sessionId)
  })

  it('frees the slot once the session ends', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.deleteSession(sessionId)
    expect(engine.getSessionByOwner('user-1')).toBeUndefined()
    await expect(engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])).resolves.toBeDefined()
  })

  it('rejects a config the game module deems invalid, without persisting', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    await expect(engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'Alice' }]))
      .rejects.toThrow(/invalid config: bull off needs at least two players/)
    expect(store.insertSession).not.toHaveBeenCalled()
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
    await engine.onBridgeEvent('unknown-board', 'dart.detected', {}, new Date())
    expect(push).not.toHaveBeenCalled()
  })

  it('pushes snapshot after visit.opened', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    expect(push).toHaveBeenCalledWith(expect.any(String))
  })

  it('flushes openVisitEvents on takeout.finished', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'takeout.finished', { visit_id: 'v1', trigger: 'numThrows.zero', duration_ms: 1000 }, new Date())
    const session = engine.getSession(sessionId)
    expect(session?.openVisitEvents).toHaveLength(0)
  })

  it('dart.corrected replaces dart at index in openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
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
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
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
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
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
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
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

  it('correct_dart drops the camera position, which no longer matches the segment', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0, source_seq: 1,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3,
        coords: { x: 0.1, y: 0.2 }, polar: { r: 0.22, theta_deg: 63 } },
    }, new Date())
    await engine.onUserAction(sessionId, {
      type: 'correct_dart', visitIndex: 0,
      segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' },
    })
    const d = engine.getSession(sessionId)!.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart).not.toHaveProperty('coords')
    expect(d.data.dart).not.toHaveProperty('polar')
  })

  it('correct_dart with coords moves the dart to that spot', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0, source_seq: 1,
      dart: { segment: { number: 3, bed: 'Single', multiplier: 1, name: 'S3' }, score: 3,
        coords: { x: 0.1, y: -0.3 }, polar: { r: 0.32, theta_deg: -72 } },
    }, new Date())
    await engine.onUserAction(sessionId, {
      type: 'correct_dart', visitIndex: 0,
      segment: { number: 20, bed: 'Triple', multiplier: 3, name: 'T20' },
      coords: { x: 0, y: 0.6 },
    })
    const d = engine.getSession(sessionId)!.openVisitEvents.find(e => e.kind === 'dart.detected') as any
    expect(d.data.dart).toMatchObject({ score: 60, coords: { x: 0, y: 0.6 }, polar: { r: 0.6, theta_deg: 90 } })
  })

  it('does not count bull off darts; the first game dart counts for the bull off winner', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01',
      { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'Alice' }, { name: 'Bob' }])
    const dart = (r: number) => ({ visit_id: 'v', index: 0, source_seq: 1,
      dart: { segment: { number: 25, bed: 'Single', multiplier: 1, name: '25' }, score: 25, polar: { r, theta_deg: 0 } } })
    for (const r of [0.2, 0.05]) {
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' }, new Date())
      await engine.onBridgeEvent('board-1', 'dart.detected', dart(r), new Date())
      await engine.onBridgeEvent('board-1', 'takeout.finished', {}, new Date())
    }
    let session = engine.getSession(sessionId)!
    expect(session.totalDarts).toEqual([0, 0])
    expect(session.totalVisits).toEqual([0, 0])

    // Bob won the bull off; the next visit is the game's first
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'g1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', dart(0.5), new Date())
    await engine.onBridgeEvent('board-1', 'takeout.finished', {}, new Date())
    session = engine.getSession(sessionId)!
    expect(session.totalDarts).toEqual([0, 1])
    expect(session.totalVisits).toEqual([0, 1])
  })

  it('passes other actions to the game module (bull off start)', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01',
      { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'Alice' }, { name: 'Bob' }])
    const dart = (r: number) => ({ visit_id: 'v', index: 0, source_seq: 1,
      dart: { segment: { number: 25, bed: 'Single', multiplier: 1, name: '25' }, score: 25, polar: { r, theta_deg: 0 } } })
    for (const r of [0.2, 0.05]) {
      await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v' }, new Date())
      await engine.onBridgeEvent('board-1', 'dart.detected', dart(r), new Date())
      await engine.onBridgeEvent('board-1', 'takeout.finished', {}, new Date())
    }
    await engine.onUserAction(sessionId, { type: 'bulloff_start' })
    const snap = engine.getSnapshot(sessionId)!
    expect((snap.game as any).phase).toBe('game')
    expect((snap.game as any).currentPlayer).toBe(1)
  })

  it('measures a manually entered bull off dart from its coordinates', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01',
      { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'Alice' }, { name: 'Bob' }])
    await engine.onUserAction(sessionId, {
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
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([3, 0])
    expect(engine.getSnapshot(sessionId)!.game.currentPlayer).toBe(1)
  })

  it('takeout after a bust records that visit, not misses', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([1, 0])
    expect(s.totalDarts).toEqual([1, 0])
  })

  it('a busted visit takes no more darts', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect(engine.getSession(sessionId)!.totalDarts).toEqual([1, 0])
  })

  it('undo after a bust accepts darts again', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 41 }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: T20 })
    await engine.onUserAction(sessionId, { type: 'undo_dart' })
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S20 })
    expect((engine.getSnapshot(sessionId)!.game.currentVisitDarts as unknown[]).length).toBe(1)
    expect((engine.getSnapshot(sessionId)!.game as X01Game).scores).toEqual([21, 41])
  })

  it('empty takeout is ignored during the bull off', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
    await engine.onUserAction(sessionId, { type: 'takeout' })
    const s = engine.getSession(sessionId)!
    expect(s.totalVisits).toEqual([0, 0])
    expect((engine.getSnapshot(sessionId)!.game as X01Game).phase).toBe('bulloff')
  })

  it('empty takeout is ignored after a win', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...x01Cfg, startScore: 40, firstTo: 1 }, [{ name: 'A' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: { name: 'D20', number: 20, bed: 'Double', multiplier: 2 } })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    expect(engine.getSession(sessionId)!.totalVisits).toEqual([1])
  })
})

describe('rebuild', () => {
  it('restores session from store and replays bridge events to rebuild state', async () => {
    const store = makeStore()
    vi.mocked(store.getActiveSessions).mockResolvedValue([{
      id: 'sess-rebuild',
      owner_user_id: 'user-1',
      board_db_id: 'board-r',
      game_id: 'atc',
      config: {},
      players: [{ name: 'Alice' }],
      created_at: new Date(),
    }])
    vi.mocked(store.getBridgeEventsForBoard).mockResolvedValue([
      { kind: 'visit.opened', data: { visit_id: 'v1' }, recv_wall: new Date() },
      {
        kind: 'dart.detected',
        data: { visit_id: 'v1', index: 0, dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 }, source_seq: 1 },
        recv_wall: new Date(),
      },
    ])

    const engine = new SessionEngine(store, push)
    await engine.rebuild()

    const session = engine.getSessionByBoard('board-r')
    expect(session).toBeDefined()
    expect(session!.id).toBe('sess-rebuild')
    // visit.opened + dart.detected → target advances from 1 to 2, one dart in currentVisitDarts
    const snap = engine.getSnapshot('sess-rebuild')!
    expect((snap.game as any).currentVisitDarts).toHaveLength(1)
    expect((snap.game as any).targets[0]).toBe(2)
    expect(engine.getSessionByOwner('user-1')?.id).toBe('sess-rebuild')
  })

  it('closes active sessions it cannot restore (boardless or without owner)', async () => {
    const store = makeStore()
    vi.mocked(store.getActiveSessions).mockResolvedValue([
      { id: 'no-board', owner_user_id: 'user-1', board_db_id: null, game_id: 'atc', config: {}, players: [{ name: 'A' }], created_at: new Date() },
      { id: 'no-owner', owner_user_id: null, board_db_id: 'board-x', game_id: 'atc', config: {}, players: [{ name: 'A' }], created_at: new Date() },
    ])
    const engine = new SessionEngine(store, push)
    await engine.rebuild()
    expect(store.setSessionFinished).toHaveBeenCalledWith('no-board')
    expect(store.setSessionFinished).toHaveBeenCalledWith('no-owner')
    expect(engine.getAllSessions()).toEqual([])
    // the owner isn't blocked by the closed session
    await expect(engine.create('user-1', null, 'atc', {}, [{ name: 'A' }])).resolves.toBeDefined()
  })
})

describe('getSnapshot', () => {
  it('returns snapshot with currentVisitDarts from openVisitEvents', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', {}, [{ name: 'Alice' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1' }, new Date())
    await engine.onBridgeEvent('board-1', 'dart.detected', {
      visit_id: 'v1', index: 0,
      dart: { segment: { number: 1, bed: 'Single', multiplier: 1, name: 'S1' }, score: 1 },
      source_seq: 1,
    }, new Date())
    const snap = engine.getSnapshot(sessionId)!
    expect(snap.type).toBe('snapshot')
    expect(snap.gameId).toBe('atc')
    expect((snap.game as any).currentVisitDarts).toHaveLength(1)
  })
})
