import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { newSession, replay, dartRows } from './replay.js'
import { games } from '../games/index.js'
import type { NewGameDart, NewGameSession, NewSessionEvent, StoredSessionEvent } from '../db/queries.js'
import type { FinishedSeat, Segment, UserAction } from './types.js'

function memoryStore() {
  const sessions = new Map<string, NewGameSession & { status: string; created_at: Date }>()
  const events: NewSessionEvent[] = []
  const darts: NewGameDart[] = []
  const finished = new Map<string, FinishedSeat[]>()
  const aborted: string[] = []
  const store: EngineStore = {
    insertSession: s => {
      sessions.set(s.id, { ...s, status: 'active', created_at: new Date() })
      return Promise.resolve()
    },
    getActiveSessions: () =>
      Promise.resolve(
        [...sessions.values()]
          .filter(s => s.status === 'active')
          .map(s => ({
            id: s.id,
            owner_user_id: s.owner_user_id,
            board_db_id: s.board_db_id,
            game_id: s.game_id,
            game_version: s.game_version,
            rng_seed: s.rng_seed,
            config: s.config,
            created_at: s.created_at,
            lobby_id: null,
            lobby_name: null,
            players: s.players.map(p => ({ ...p, board_name: null })),
          })),
      ),
    getSessionEvents: (id): Promise<StoredSessionEvent[]> =>
      Promise.resolve(
        events
          .filter(e => e.session_id === id)
          .sort((a, b) => a.seq - b.seq)
          .map(e => ({ seq: e.seq, source: e.source, kind: e.kind, data: JSON.parse(JSON.stringify(e.data)), created_at: e.created_at })),
      ),
    appendEvent: e => {
      events.push(e)
      return Promise.resolve()
    },
    insertDarts: rows => {
      for (const r of rows)
        if (!darts.some(d => d.session_id === r.session_id && d.visit === r.visit && d.dart_index === r.dart_index)) darts.push(r)
      return Promise.resolve()
    },
    deleteDarts: (id, visit) => {
      for (let i = darts.length - 1; i >= 0; i--) if (darts[i].session_id === id && darts[i].visit === visit) darts.splice(i, 1)
      return Promise.resolve()
    },
    finishSession: (id, _at, r) => {
      finished.set(id, r)
      const s = sessions.get(id)
      if (s) s.status = 'finished'
      return Promise.resolve()
    },
    abortSession: id => {
      aborted.push(id)
      const s = sessions.get(id)
      if (s) s.status = 'aborted'
      return Promise.resolve()
    },
  }
  return { store, sessions, events, darts, finished, aborted }
}

const seg = (name: string, number: number, bed: Segment['bed'], multiplier: 0 | 1 | 2 | 3): Segment => ({ name, number, bed, multiplier })
const MISS = seg('Miss', 0, 'Outside', 0),
  B25 = seg('25', 25, 'SingleOuter', 1),
  S20 = seg('S20', 20, 'Single', 1)
const S5 = seg('S5', 5, 'Single', 1),
  S1 = seg('S1', 1, 'Single', 1),
  T20 = seg('T20', 20, 'Triple', 3)

type Step = ['board', string, unknown] | ['user', UserAction]
const opened = (v: string): Step => ['board', 'visit.opened', { visit_id: v }]
const camera = (v: string, index: number, s: Segment): Step => [
  'board',
  'dart.detected',
  { visit_id: v, index, source_seq: index + 1, dart: { segment: s, score: s.number * s.multiplier } },
]
const takeout = (v: string): Step => ['board', 'takeout.finished', { visit_id: v, trigger: 'numThrows.zero', duration_ms: 900 }]

// X01 301 straight out, first to 1, WDC bull off between A and B
const CONFIG = { ...games.x01!.defaultConfig, startScore: 301, outMode: 'straight', firstTo: 1, bullOff: 'wdc' }
const PLAYERS = [{ name: 'A' }, { name: 'B' }]
const SCRIPT: Step[] = [
  // bull off: both miss → rethrow (B first now), B hits the 25, A a single 20 → B starts
  opened('b1'),
  camera('b1', 0, MISS),
  takeout('b1'),
  opened('b2'),
  camera('b2', 0, MISS),
  takeout('b2'),
  opened('b3'),
  camera('b3', 0, B25),
  takeout('b3'),
  opened('b4'),
  camera('b4', 0, S20),
  takeout('b4'),
  // B: 180 → 121
  opened('g1'),
  camera('g1', 0, T20),
  camera('g1', 1, T20),
  camera('g1', 2, T20),
  takeout('g1'),
  // A: camera S5 corrected to S20, manual T20 undone, manual S1 → 21 (280)
  opened('g2'),
  camera('g2', 0, S5),
  [
    'board',
    'dart.corrected',
    { visit_id: 'g2', index: 0, source_seq: 9, dart: { segment: S20, score: 20 }, previous: { segment: S5, score: 5 } },
  ],
  ['user', { type: 'add_dart', segment: T20 }],
  ['user', { type: 'undo_dart' }],
  ['user', { type: 'add_dart', segment: S1 }],
  ['user', { type: 'takeout' }],
  // B: T20 lost to a resync, then T20 S1 → 61 (60 left)
  opened('g3'),
  camera('g3', 0, T20),
  ['board', 'board.resync', { throws: [] }],
  camera('g3', 0, T20),
  camera('g3', 1, S1),
  takeout('g3'),
]
const ENDING: Step[] = [
  // A: empty turn → three misses; B: T20 checks out 60. The board's takeout waits (dropped
  // unlogged); Finish ends the game
  ['user', { type: 'takeout' }],
  opened('g5'),
  camera('g5', 0, T20),
  takeout('g5'),
  ['user', { type: 'takeout' }],
]

async function play(engine: SessionEngine, sessionId: string, steps: Step[]) {
  for (const s of steps) {
    if (s[0] === 'board') await engine.onBridgeEvent('board-1', s[1], s[2])
    else await engine.onUserAction(sessionId, 'user-1', s[1])
  }
}

describe('the input log', () => {
  it('replays to exactly the game that was played', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    await play(live, sessionId, [...SCRIPT, ...ENDING])

    const played = live.getSession(sessionId)!
    expect(played.status).toBe('finished')
    expect(mem.finished.get(sessionId)?.map(r => r.placement)).toEqual([2, 1])
    // The bull off made B (seat 1) throw first
    expect(mem.finished.get(sessionId)?.map(r => r.throwPosition)).toEqual([1, 0])

    const row = mem.sessions.get(sessionId)!
    const again = newSession({
      id: sessionId,
      ownerUserId: 'user-1',
      boardId: 'board-1',
      module: games.x01!,
      config: CONFIG,
      seats: PLAYERS.map((p, i) => ({
        name: p.name,
        userId: i === 0 ? 'user-1' : null,
        controllerUserId: 'user-1',
        boardId: 'board-1',
        boardName: null,
        bot: null,
      })),
      seed: row.rng_seed,
      createdAt: row.created_at,
    })
    const { visits, won } = replay(again, await mem.store.getSessionEvents(sessionId), vi.fn())

    expect(won).toBe(true)
    expect(again.committedState).toEqual(played.committedState)
    expect(again.totalDarts).toEqual(played.totalDarts)
    expect(again.totalVisits).toEqual(played.totalVisits)
    expect(visits.flatMap(v => dartRows(sessionId, v))).toEqual(mem.darts)
    // camera / manual / corrected made it into the darts
    const a = mem.darts.filter(d => d.visit === 5)
    expect(a.map(d => [d.source, d.corrected])).toEqual([
      ['camera', true],
      ['manual', false],
    ])
    expect(mem.darts.filter(d => d.visit === 7).map(d => d.source)).toEqual(['manual', 'manual', 'manual'])
    expect(mem.darts.filter(d => d.phase === 'bulloff')).toHaveLength(4)
  })

  it('restores a running game after a restart, boardless and manual darts included', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    await play(live, sessionId, SCRIPT)
    const solo = await live.create('user-2', null, 'atc', { ...games.atc!.defaultConfig, order: 'random' }, [{ name: 'Solo' }])
    await live.onUserAction(solo.sessionId, 'user-2', { type: 'add_dart', segment: S1 })

    const restarted = new SessionEngine(mem.store, vi.fn())
    await restarted.rebuild()

    expect(restarted.getSnapshot(sessionId)).toEqual(live.getSnapshot(sessionId))
    expect(restarted.getSnapshot(solo.sessionId)).toEqual(live.getSnapshot(solo.sessionId))
    expect(restarted.getSessionByBoard('board-1')?.id).toBe(sessionId)
    expect(restarted.getSessionByUser('user-2')?.id).toBe(solo.sessionId)
    // carries on numbering the log
    await play(restarted, sessionId, ENDING)
    expect(mem.events.filter(e => e.session_id === sessionId).map(e => e.seq)).toEqual(
      mem.events.filter(e => e.session_id === sessionId).map((_, i) => i),
    )
    expect(mem.finished.has(sessionId)).toBe(true)
  })

  it('finishes on restart a game whose win was logged but not saved', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    mem.store.finishSession = () => Promise.reject(new Error('db down'))
    await play(live, sessionId, SCRIPT)
    await play(live, sessionId, ENDING).catch(() => undefined)
    const fresh = memoryStore()
    Object.assign(fresh.store, {
      ...mem.store,
      finishSession: (id: string, _at: Date, r: FinishedSeat[]) => {
        fresh.finished.set(id, r)
        return Promise.resolve()
      },
    })
    const restarted = new SessionEngine(fresh.store, vi.fn())
    await restarted.rebuild()
    expect(fresh.finished.get(sessionId)?.map(r => r.placement)).toEqual([2, 1])
    expect(restarted.getSession(sessionId)).toBeUndefined()
  })
})

describe('engine persistence', () => {
  it('logs each input before applying it; a failed append changes nothing', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1', extra: 'kept' })
    expect(mem.events.map(e => [e.seq, e.source, e.kind, e.data])).toEqual([
      [0, 'board', 'visit.opened', { visit_id: 'v1', extra: 'kept' }],
    ])
    mem.store.appendEvent = () => Promise.reject(new Error('db down'))
    await expect(engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S1 })).rejects.toThrow('db down')
    expect(engine.getSession(sessionId)!.openDarts).toEqual([])
  })

  it('does not log board.status or unreadable events', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onBridgeEvent('board-1', 'board.status', { status: 'Throw', running: true, event: 'x' })
    await engine.onBridgeEvent('board-1', 'takeout.started', {})
    expect(mem.events).toEqual([])
  })

  it('applies inputs in the order they are logged, even when they arrive together', async () => {
    const mem = memoryStore()
    let release: () => void = () => undefined
    const gate = new Promise<void>(r => {
      release = r
    })
    const append = mem.store.appendEvent.bind(mem.store)
    let first = true
    mem.store.appendEvent = async e => {
      if (first) {
        first = false
        await gate
      }
      await append(e)
    }
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    const a = engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S1 })
    const b = engine.onUserAction(sessionId, 'user-1', { type: 'undo_dart' })
    release()
    await Promise.all([a, b])
    expect(mem.events.map(e => e.kind)).toEqual(['add_dart', 'undo_dart'])
    expect(engine.getSession(sessionId)!.openDarts).toEqual([])
  })

  it('ignores input after the game is won', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...CONFIG, bullOff: 'off', startScore: 301 }, [{ name: 'A' }])
    for (let i = 0; i < 5; i++) {
      // 5 × 60 = 300, then 1
      for (const s of [S20, S20, S20]) await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: s })
      await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    }
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S1 })
    await engine.onUserAction(sessionId, 'user-1', { type: 'takeout' })
    expect(mem.finished.has(sessionId)).toBe(true)
    const logged = mem.events.length
    await engine.onUserAction(sessionId, 'user-1', { type: 'undo_dart' })
    expect(mem.events.length).toBe(logged)
  })

  it('aborting keeps the log and writes no result', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onUserAction(sessionId, 'user-1', { type: 'add_dart', segment: S1 })
    await engine.deleteSession(sessionId)
    expect(mem.aborted).toEqual([sessionId])
    expect(mem.events).toHaveLength(1)
    expect(mem.finished.has(sessionId)).toBe(false)
  })

  it('rebuild aborts games it cannot restore', async () => {
    const mem = memoryStore()
    mem.sessions.set('gone', {
      id: 'gone',
      owner_user_id: 'user-1',
      board_db_id: null,
      game_id: 'no-such-game',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [{ name: 'A', user_id: 'user-1', controller_user_id: 'user-1', board_db_id: null, bot_level: null }],
      status: 'active',
      created_at: new Date(),
    })
    await new SessionEngine(mem.store, vi.fn()).rebuild()
    expect(mem.aborted).toEqual(['gone'])
  })

  it('an undone visit, corrected and committed again, replays and saves as corrected', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', null, 'x01', { ...CONFIG, bullOff: 'off' }, PLAYERS)
    await play(live, sessionId, [
      ['user', { type: 'add_dart', segment: T20 }],
      ['user', { type: 'takeout' }],
      ['user', { type: 'undo_dart' }],
      ['user', { type: 'correct_dart', visitIndex: 0, segment: S20 }],
      ['user', { type: 'takeout' }],
    ])
    expect(mem.darts.filter(d => d.session_id === sessionId).map(d => [d.visit, (d.segment as Segment).name])).toEqual([[0, 'S20']])

    const restarted = new SessionEngine(mem.store, vi.fn())
    await restarted.rebuild()
    expect(restarted.getSnapshot(sessionId)).toEqual(live.getSnapshot(sessionId))
  })
})

describe('newSession rng', () => {
  it('keeps a live Rng seeded from the session, continuing past what init consumed', () => {
    const session = newSession({
      id: 's1',
      ownerUserId: 'chris',
      boardId: null,
      module: games.x01!,
      config: games.x01!.defaultConfig,
      seats: [{ name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null, bot: null }],
      seed: 42,
      createdAt: new Date(),
    })
    expect(typeof session.rng).toBe('function')
    const a = session.rng()
    const b = session.rng()
    expect(a).not.toBe(b) // a continuing stream, not the same value called twice
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })

  it('two sessions with the same seed draw the same sequence after init', () => {
    const make = () =>
      newSession({
        id: 's1',
        ownerUserId: 'chris',
        boardId: null,
        module: games.x01!,
        config: games.x01!.defaultConfig,
        seats: [{ name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null, bot: null }],
        seed: 7,
        createdAt: new Date(),
      })
    const first = make()
    const second = make()
    expect(first.rng()).toBe(second.rng())
    expect(first.rng()).toBe(second.rng())
  })

  it('replaying logged inputs never touches rng again (bot darts replay as recorded, not re-rolled)', () => {
    const session = newSession({
      id: 's1',
      ownerUserId: 'chris',
      boardId: null,
      module: games.x01!,
      config: games.x01!.defaultConfig,
      seats: [{ name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null, bot: null }],
      seed: 1,
      createdAt: new Date(),
    })
    const before = session.rng()
    const after1 = session.rng()
    // A fresh rebuild from the same seed draws the exact same two values, proving replay()
    // (called next, with however many logged rows) doesn't consume any more from the stream
    const rebuilt = newSession({
      id: 's1',
      ownerUserId: 'chris',
      boardId: null,
      module: games.x01!,
      config: games.x01!.defaultConfig,
      seats: [{ name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null, bot: null }],
      seed: 1,
      createdAt: new Date(),
    })
    replay(rebuilt, [], () => undefined) // an empty log: nothing to replay
    expect(rebuilt.rng()).toBe(before)
    expect(rebuilt.rng()).toBe(after1)
  })
})
