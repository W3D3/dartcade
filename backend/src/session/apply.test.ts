import { describe, it, expect } from 'vitest'
import { applyInput, awaitsFinish, type GameInput } from './apply.js'
import { atcModule } from '../games/atc.js'
import { x01Module } from '../games/x01.js'
import { seededRng } from './rng.js'
import type { AnyGameModule, Session, Segment } from './types.js'

function session(module: AnyGameModule, config: Record<string, unknown>, n = 1): Session {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))
  const rng = seededRng(0)
  const s = module.init(config, players, rng)
  return {
    id: 's1',
    ownerUserId: 'u1',
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players,
    module,
    seats: players.map(p => ({ name: p.name, userId: null, controllerUserId: 'u1', boardId: 'b1', boardName: null, bot: null })),
    committedState: s,
    currentState: s,
    openVisitEvents: [],
    openDarts: [],
    status: 'active',
    createdAt: new Date(0),
    seed: 0,
    rng,
    visitCount: 0,
    nextSeq: 0,
    totalDarts: Array<number>(n).fill(0),
    totalVisits: Array<number>(n).fill(0),
    boardStatus: new Map(),
    forfeited: [],
    undoable: [],
  }
}
const S1: Segment = { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }
const S2: Segment = { name: 'S2', number: 2, bed: 'Single', multiplier: 1 }
const board = (kind: string, data: unknown = {}): GameInput => ({ source: 'board', event: { kind, data } as never })
const dart = (s: Segment, index: number, coords?: { x: number; y: number }): GameInput => ({
  source: 'board',
  event: {
    kind: 'dart.detected',
    data: { visit_id: 'v', index, source_seq: 1, dart: { segment: s, score: s.number, ...(coords && { coords }) } },
  },
})
const t = (ms: number) => new Date(Date.UTC(2026, 9, 1, 10, 0, 0, ms))

describe('applyInput', () => {
  it('commits a camera visit with its darts, seat, leg and phase', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0, { x: 0.1, y: 0.2 }), t(1))
    const out = applyInput(s, board('takeout.finished'), t(2))
    expect(out.won).toBe(false)
    expect(out.committed).toMatchObject({ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: t(2).toISOString() })
    expect(out.committed?.darts).toEqual([
      { index: 0, segment: S1, coords: { x: 0.1, y: 0.2 }, source: 'camera', corrected: false, thrownAt: t(1).toISOString() },
    ])
    expect(s.visitCount).toBe(1)
    expect(s.openDarts).toEqual([])
  })

  it('marks manual and corrected darts, and undo drops the last one', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    applyInput(
      s,
      {
        source: 'board',
        event: {
          kind: 'dart.corrected',
          data: { visit_id: 'v', index: 0, source_seq: 2, dart: { segment: S2, score: 2 }, previous: { segment: S1, score: 1 } },
        },
      },
      t(2),
    )
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S1 } }, t(3))
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S2 } }, t(4))
    applyInput(s, { source: 'user', action: { type: 'undo_dart' } }, t(5))
    const out = applyInput(s, { source: 'user', action: { type: 'takeout' } }, t(6))
    expect(out.committed?.darts.map(d => [d.segment.name, d.source, d.corrected])).toEqual([
      ['S2', 'camera', true],
      ['S1', 'manual', false],
    ])
  })

  it('an empty takeout commits three manual misses', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    const out = applyInput(s, { source: 'user', action: { type: 'takeout' } }, t(0))
    expect(out.committed?.darts.map(d => [d.segment.name, d.source])).toEqual([
      ['Miss', 'manual'],
      ['Miss', 'manual'],
      ['Miss', 'manual'],
    ])
  })

  it('a resync drops the open darts', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    applyInput(s, board('board.resync'), t(2))
    expect(s.openDarts).toEqual([])
    expect(s.totalDarts).toEqual([0])
  })

  it('reports the win', () => {
    const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 301, outMode: 'straight', firstTo: 1 })
    s.committedState = { ...(s.committedState as object), game: { ...(s.committedState as any).game, scores: [1] } }
    s.currentState = s.committedState
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    expect(applyInput(s, board('takeout.finished'), t(2)).won).toBe(true)
  })

  it('tags bull off visits', () => {
    const s = session(x01Module, { ...x01Module.defaultConfig, bullOff: 'wdc' }, 2)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    const out = applyInput(s, board('takeout.finished'), t(2))
    expect(out.committed).toMatchObject({ seat: 0, phase: 'bulloff' })
    expect(s.totalVisits).toEqual([0, 0])
  })

  it('a forfeit drops the open visit and decides the game', () => {
    const s = session(x01Module, x01Module.defaultConfig, 2)
    applyInput(
      s,
      { source: 'user', action: { type: 'add_dart', segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } } },
      new Date(),
    )
    const out = applyInput(s, { source: 'user', action: { type: 'forfeit', seats: [0] } }, new Date())
    expect(out).toEqual({ committed: null, won: true })
    expect(s.forfeited).toEqual([0])
    expect(s.openVisitEvents).toEqual([])
    expect(s.totalDarts).toEqual([0, 0])
  })

  it('a forfeit without seats changes nothing', () => {
    const s = session(x01Module, x01Module.defaultConfig, 2)
    expect(applyInput(s, { source: 'user', action: { type: 'forfeit' } }, new Date())).toEqual({ committed: null, won: false })
  })

  it("a forfeit rolls back the open visit's darts from whoever is up, not the forfeiter", () => {
    const s = session(x01Module, x01Module.defaultConfig, 2)
    // seat 0 commits a visit of three misses, handing the turn to seat 1
    applyInput(s, { source: 'user', action: { type: 'takeout' } }, new Date())
    expect(s.totalDarts).toEqual([3, 0])
    // seat 1 is now up and throws two darts
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S1 } }, new Date())
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S1 } }, new Date())
    expect(s.totalDarts).toEqual([3, 2])
    // seat 0 forfeits; seat 1's open darts (not seat 0's) must be discarded
    const out = applyInput(s, { source: 'user', action: { type: 'forfeit', seats: [0] } }, new Date())
    expect(out).toEqual({ committed: null, won: true })
    expect(s.totalDarts).toEqual([3, 0])
  })

  describe('awaitsFinish', () => {
    const D20: Segment = { name: 'D20', number: 20, bed: 'Double', multiplier: 2 }
    const S20: Segment = { name: 'S20', number: 20, bed: 'Single', multiplier: 1 }
    const add = (segment: Segment): GameInput => ({ source: 'user', action: { type: 'add_dart', segment } })

    it('X01: a checkout that wins the match waits; one that only wins a leg does not', () => {
      const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 40, firstTo: 1 }, 2)
      expect(awaitsFinish(s)).toBe(false)
      applyInput(s, add(D20), t(0))
      expect(awaitsFinish(s)).toBe(true)
      const leg = session(x01Module, { ...x01Module.defaultConfig, startScore: 40, firstTo: 2 }, 2)
      applyInput(leg, add(D20), t(0))
      expect(awaitsFinish(leg)).toBe(false)
    })

    it('X01: correcting the double away ends the wait', () => {
      const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 40, firstTo: 1 }, 2)
      applyInput(s, add(D20), t(0))
      applyInput(s, { source: 'user', action: { type: 'correct_dart', visitIndex: 0, segment: S20 } }, t(1))
      expect(awaitsFinish(s)).toBe(false)
    })

    it('Around the Clock: the last target hit waits', () => {
      const s = session(atcModule, atcModule.defaultConfig)
      for (let n = 1; n <= 20; n++) {
        applyInput(s, add({ name: `S${n}`, number: n, bed: 'Single', multiplier: 1 }), t(n))
        applyInput(s, { source: 'user', action: { type: 'takeout' } }, t(n))
      }
      expect(awaitsFinish(s)).toBe(false)
      applyInput(s, add({ name: '25', number: 25, bed: 'Single', multiplier: 1 }), t(30))
      expect(awaitsFinish(s)).toBe(true)
    })
  })

  describe('undo with nothing open', () => {
    const T20: Segment = { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }
    const S20: Segment = { name: 'S20', number: 20, bed: 'Single', multiplier: 1 }
    const D20: Segment = { name: 'D20', number: 20, bed: 'Double', multiplier: 2 }
    const add = (segment: Segment): GameInput => ({ source: 'user', action: { type: 'add_dart', segment } })
    const user = (type: 'takeout' | 'undo_dart'): GameInput => ({ source: 'user', action: { type } })
    const game = (s: Session) =>
      s.module.view(s.currentState, s.players) as unknown as { currentPlayer: number; scores: number[]; legs: number[] }

    it('reopens the last visit for its thrower, to correct and commit again', () => {
      const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 301 }, 2)
      applyInput(s, add(T20), t(0))
      applyInput(s, user('takeout'), t(1))
      expect(game(s).currentPlayer).toBe(1)

      expect(applyInput(s, user('undo_dart'), t(2))).toEqual({ committed: null, won: false, reopened: 0 })
      expect(game(s)).toMatchObject({ currentPlayer: 0, scores: [241, 301] })
      expect(s.totalVisits).toEqual([0, 0])
      expect(s.totalDarts).toEqual([1, 0])

      applyInput(s, { source: 'user', action: { type: 'correct_dart', visitIndex: 0, segment: S20 } }, t(3))
      const out = applyInput(s, user('takeout'), t(4))
      expect(out.committed).toMatchObject({ visit: 0, seat: 0 })
      expect(game(s)).toMatchObject({ currentPlayer: 1, scores: [281, 301] })
    })

    it('goes back across a won leg', () => {
      const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 40, firstTo: 2 }, 2)
      applyInput(s, add(D20), t(0))
      applyInput(s, user('takeout'), t(1))
      expect(game(s).legs).toEqual([1, 0])
      applyInput(s, user('undo_dart'), t(2))
      expect(game(s)).toMatchObject({ currentPlayer: 0, legs: [0, 0], scores: [0, 40] })
    })

    it('does nothing before the first visit', () => {
      const s = session(x01Module, x01Module.defaultConfig, 2)
      expect(applyInput(s, user('undo_dart'), t(0))).toEqual({ committed: null, won: false })
    })
  })
})
