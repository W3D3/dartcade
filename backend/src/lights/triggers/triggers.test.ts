import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../../schema/game-ws.js'
import { triggersFor } from './index.js'

type G = Record<string, unknown>
const snap = (gameId: string, game: G): Snapshot => ({ gameId, game }) as unknown as Snapshot

const x01 = (g: G = {}) =>
  snap('x01', {
    phase: 'game',
    currentPlayer: 0,
    winner: null,
    scores: [501, 501],
    visitStartScores: [501, 501],
    bustThisVisit: false,
    visitLocked: false,
    currentVisitDarts: [],
    totalVisits: [0, 0],
    legs: [0, 0],
    firstTo: 1,
    ...g,
  })

describe('common triggers', () => {
  it('a new game lights the first seat', () => {
    expect(triggersFor(null, x01())).toEqual([{ kind: 'turn', seat: 0 }])
  })
  it('a seat change is a turn', () => {
    expect(triggersFor(x01(), x01({ currentPlayer: 1 }))).toEqual([{ kind: 'turn', seat: 1 }])
  })
  it('a non-x01 win is game.won and no turn', () => {
    const g = (winner: number | null) => snap('atc', { currentPlayer: 0, winner, targets: [1, 1], currentVisitHits: [false] })
    expect(triggersFor(g(null), g(0))).toEqual([{ kind: 'game.won', seat: 0 }])
  })
  it("x01's takeout that sets winner afterwards by a checkout has no game.won (already shown on the winning dart) and no turn", () => {
    const after = x01({ currentPlayer: 1, winner: 0, phase: 'finished', scores: [0, 501] })
    expect(triggersFor(x01({ currentPlayer: 0 }), after)).toEqual([])
  })
  it('the end of a bull off is bulloff.won for the first thrower, then their turn', () => {
    const b = x01({ phase: 'bulloff', currentPlayer: 1 })
    expect(triggersFor(b, x01({ currentPlayer: 1 }))).toEqual([
      { kind: 'bulloff.won', seat: 1 },
      { kind: 'turn', seat: 1 },
    ])
  })
  it('nothing changed, nothing fires (board presence pushes)', () => {
    expect(triggersFor(x01(), x01())).toEqual([])
  })
})

describe('x01', () => {
  const darts = (n: number) => Array.from({ length: n }, () => ({}))
  it('the third dart of a 180', () => {
    const before = x01({ currentVisitDarts: darts(2), scores: [381, 501] })
    const after = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    expect(triggersFor(before, after)).toEqual([{ kind: 'visit', seat: 0, total: 180 }])
  })
  it('a bust', () => {
    const before = x01({ currentVisitDarts: darts(1), scores: [30, 501], visitStartScores: [40, 501] })
    const after = x01({
      currentVisitDarts: darts(2),
      scores: [40, 501],
      visitStartScores: [40, 501],
      bustThisVisit: true,
      visitLocked: true,
    })
    expect(triggersFor(before, after)).toEqual([{ kind: 'bust', seat: 0 }])
  })
  it('a leg checkout that does not win the match', () => {
    const before = x01({ currentVisitDarts: darts(1), scores: [40, 501], visitStartScores: [40, 501], firstTo: 3 })
    const after = x01({ currentVisitDarts: darts(2), scores: [0, 501], visitStartScores: [40, 501], visitLocked: true, firstTo: 3 })
    expect(triggersFor(before, after)).toEqual([{ kind: 'checkout', seat: 0 }])
  })
  it('a match-winning checkout dart is game.won, not checkout (the takeout afterwards fires nothing more)', () => {
    const before = x01({ currentVisitDarts: darts(1), scores: [40, 501], visitStartScores: [40, 501] })
    const after = x01({ currentVisitDarts: darts(2), scores: [0, 501], visitStartScores: [40, 501], visitLocked: true })
    expect(triggersFor(before, after)).toEqual([{ kind: 'game.won', seat: 0 }])
  })
  it("a team game's match-winning checkout uses the team's legs, not the per-seat count", () => {
    const g = (overrides: G) =>
      x01({
        legs: [0, 0, 0, 0],
        firstTo: 3,
        teams: [
          { id: 'A', name: 'Team A', seats: [0, 2], score: 0, legs: 2 },
          { id: 'B', name: 'Team B', seats: [1, 3], score: 0, legs: 0 },
        ],
        ...overrides,
      })
    const before = g({ currentVisitDarts: darts(1), scores: [40, 501, 501, 501], visitStartScores: [40, 501, 501, 501] })
    const after = g({
      currentVisitDarts: darts(2),
      scores: [0, 501, 501, 501],
      visitStartScores: [40, 501, 501, 501],
      visitLocked: true,
    })
    expect(triggersFor(before, after)).toEqual([{ kind: 'game.won', seat: 0 }])
  })
  it('committing an already-over visit fires nothing more (the turn is the next seat)', () => {
    const before = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    const after = x01({ currentPlayer: 1, currentVisitDarts: [], scores: [321, 501], totalVisits: [1, 0] })
    expect(triggersFor(before, after)).toEqual([{ kind: 'turn', seat: 1 }])
  })
  it('an early takeout commits the visit with its total', () => {
    const before = x01({ currentVisitDarts: darts(2), scores: [401, 501] })
    const after = x01({
      currentPlayer: 1,
      currentVisitDarts: [],
      scores: [401, 501],
      visitStartScores: [401, 501],
      totalVisits: [1, 0],
    })
    expect(triggersFor(before, after)).toEqual([
      { kind: 'visit', seat: 0, total: 100 },
      { kind: 'turn', seat: 1 },
    ])
  })
  it('a round-limit win (no checkout) still yields game.won', () => {
    const before = x01({ currentVisitDarts: darts(2), scores: [310, 350], visitStartScores: [320, 350] })
    const after = x01({
      currentPlayer: 1,
      currentVisitDarts: [],
      scores: [310, 350],
      visitStartScores: [320, 350],
      totalVisits: [1, 0],
      winner: 0,
      phase: 'finished',
    })
    expect(triggersFor(before, after)).toEqual([
      { kind: 'visit', seat: 0, total: 10 },
      { kind: 'game.won', seat: 0 },
    ])
  })
  it('a correction to a visit that was already over does not flash again', () => {
    const before = x01({ currentVisitDarts: darts(3), scores: [321, 501] })
    const after = x01({ currentVisitDarts: darts(3), scores: [341, 501] })
    expect(triggersFor(before, after)).toEqual([])
  })
  it('a reopened visit committed again does not flash again', () => {
    const reopened = x01({ currentVisitDarts: darts(3), scores: [321, 501], totalVisits: [0, 0] })
    const recommitted = x01({ currentPlayer: 1, currentVisitDarts: [], scores: [321, 501], totalVisits: [1, 0] })
    expect(triggersFor(reopened, recommitted)).toEqual([{ kind: 'turn', seat: 1 }])
  })
})

describe('other games', () => {
  it('atc: a hit on the current target', () => {
    const g = (hits: boolean[], target: number) =>
      snap('atc', { currentPlayer: 0, winner: null, targets: [target, 1], currentVisitHits: hits })
    expect(triggersFor(g([false], 3), g([false, true], 4))).toEqual([{ kind: 'atc.hit', seat: 0, target: 3 }])
  })
  it('hilo: a life lost', () => {
    const g = (lives: number) => snap('hilo', { phase: 'game', currentPlayer: 0, winner: null, seats: [{ lives }, { lives: 3 }] })
    expect(triggersFor(g(3), g(2))).toEqual([{ kind: 'hilo.lifeLost', seat: 0 }])
  })
  it('minigolf: a ball sunk', () => {
    const g = (status: string, strokes: number) =>
      snap('minigolf', {
        currentPlayer: 0,
        winner: null,
        holeIdx: 2,
        balls: [
          { status, strokes },
          { status: 'waiting', strokes: 0 },
        ],
      })
    expect(triggersFor(g('playing', 2), g('holed', 3))).toEqual([{ kind: 'golf.sunk', seat: 0, strokes: 3 }])
  })
  it('minigolf: the last player sinking the hole-ending putt still flashes (balls reset for the next hole in the same snapshot)', () => {
    const before = snap('minigolf', {
      currentPlayer: 1,
      winner: null,
      holeIdx: 0,
      balls: [
        { status: 'holed', strokes: 3 },
        { status: 'playing', strokes: 2 },
      ],
    })
    const after = snap('minigolf', {
      currentPlayer: 0,
      winner: null,
      holeIdx: 1,
      balls: [
        { status: 'waiting', strokes: 0 },
        { status: 'waiting', strokes: 0 },
      ],
      config: { maxStrokes: 6 },
      lastHole: { index: 0, scores: [3, 3] },
    })
    expect(triggersFor(before, after).filter(t => t.kind === 'golf.sunk')).toEqual([{ kind: 'golf.sunk', seat: 1, strokes: 3 }])
  })
  it('minigolf: a seat that runs out of strokes without holing out is not a sink', () => {
    const before = snap('minigolf', {
      currentPlayer: 1,
      winner: null,
      holeIdx: 0,
      balls: [
        { status: 'holed', strokes: 3 },
        { status: 'playing', strokes: 5 },
      ],
    })
    const after = snap('minigolf', {
      currentPlayer: 0,
      winner: null,
      holeIdx: 1,
      balls: [
        { status: 'waiting', strokes: 0 },
        { status: 'waiting', strokes: 0 },
      ],
      config: { maxStrokes: 6 },
      lastHole: { index: 0, scores: [3, 7] },
    })
    expect(triggersFor(before, after).filter(t => t.kind === 'golf.sunk')).toEqual([])
  })
})
