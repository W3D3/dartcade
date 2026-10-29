import { describe, it, expect } from 'vitest'
import { cricketGame, type CricketConfig, type CricketState } from './cricket.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Segment } from '../session/types.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const T20 = seg('T20', 20, 3),
  S20 = seg('S20', 20, 1),
  MISS = seg('Miss', 0, 0)
const T = (n: number) => seg(`T${n}`, n, 3)
const BULL = seg('Bull', 50, 1)
const OUTER = seg('Outer', 25, 1)
// Seat 0 triples 20 (opens it, then scores 60 twice more while seat 1 hasn't opened it), then
// sweeps the rest plainly (no more extra marks, so no more points); seat 1 always misses. Wins
// the leg with 120 points to seat 1's 0.
const sweepWithOverkill: Segment[][] = [
  [T20, T20, T20],
  [MISS, MISS, MISS],
  [T(19), T(18), T(17)],
  [MISS, MISS, MISS],
  [T(16), T(15), BULL],
  [MISS, MISS, MISS],
  [OUTER],
]
// A plain sweep: opens every target exactly once, no overkill, so no points either way.
const plainSweep: Segment[][] = [
  [T20, T(19), T(18)],
  [MISS, MISS, MISS],
  [T(17), T(16), T(15)],
  [MISS, MISS, MISS],
  [BULL, OUTER, MISS],
]

const cfg = (over: Partial<CricketConfig> = {}): CricketConfig => ({
  mode: 'standard',
  firstTo: 1,
  bullOff: 'off',
  botSpeed: 'normal',
  format: 'singles',
  ...over,
})
const hd = (s: Segment, index: number): HistoryDart => ({
  index,
  segment: s,
  coords: null,
  source: 'manual',
  corrected: false,
  thrownAt: '2026-10-01T10:00:00.000Z',
})
const dartEvent = (s: Segment, index: number): BoardEvent => ({
  kind: 'dart.detected',
  data: { visit_id: 'v', index, source_seq: 0, dart: { segment: s, score: s.number * s.multiplier } },
})

/** Plays visits in order (whoever is up throws each); returns the committed visits and the final state. */
function play(c: CricketConfig, names: string[], throws: Segment[][]): { visits: CommittedVisit<CricketState>[]; final: CricketState } {
  let s = cricketGame.init(
    c,
    names.map(name => ({ name })),
  )
  const visits: CommittedVisit<CricketState>[] = []
  throws.forEach((darts, n) => {
    const seat = s.currentPlayer
    const leg = cricketGame.getLeg?.(s) ?? 0
    const start = cricketGame.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
    let end = start
    darts.forEach((d, i) => {
      end = cricketGame.onBoardEvent(end, dartEvent(d, i)).state
    })
    const after = cricketGame.onBoardEvent(end, { kind: 'takeout.finished', data: {} }).state
    visits.push({ visit: n, seat, leg, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: darts.map(hd), start, end, after })
    s = after
  })
  return { visits, final: s }
}

const statsOf = (r: ReturnType<typeof play>) => cricketGame.matchStats!(r.visits, r.final)
const seatValues = (r: ReturnType<typeof play>, seat: number) => statsOf(r).seats.find(v => v.index === seat)!.values

describe('cricket matchStats', () => {
  it('declares the rows in the spec order', () => {
    const r = play(cfg(), ['A'], [])
    expect(statsOf(r).rows.map(x => x.key)).toEqual([
      'mpr',
      'marks20',
      'marks19',
      'marks18',
      'marks17',
      'marks16',
      'marks15',
      'marksBull',
      'visits5',
      'visits7',
      'visits9',
      'points',
      'dartsThrown',
    ])
  })

  it('a T20, T20, S20 round (7 counted marks) counts in visits5 and visits7, not visits9', () => {
    const r = play(cfg(), ['A', 'B'], [[T20, T20, S20], [MISS]])
    const a = seatValues(r, 0)
    expect(a.marks20).toBe(7)
    expect(a.visits5).toBe(1)
    expect(a.visits7).toBe(1)
    expect(a.visits9).toBe(0)
    expect(a.mpr).toBeCloseTo((7 / 3) * 3)
  })

  it('points are the team’s, not just what this seat personally scored', () => {
    const four = ['A1', 'B1', 'A2', 'B2']
    const r = play({ ...cfg(), format: 'teams', teams: [0, 1, 0, 1] }, four, [
      [T20, T20, S20], // A1 opens and scores for team A
      [MISS],
    ])
    const a1 = seatValues(r, 0)
    const a2 = seatValues(r, 2)
    expect(a1.points).toBe(a2.points)
    const teamA = statsOf(r).teams!.find(t => t.index === 0)!.values
    expect(teamA.points).toBe(a1.points)
  })

  it('reports legsWon, the race so far', () => {
    const r = play({ ...cfg(), firstTo: 2 }, ['A', 'B'], sweepWithOverkill)
    expect(r.final.legs).toEqual([1, 0]) // the race isn't over: only one leg played
    expect(seatValues(r, 0).legsWon).toBe(1)
    expect(seatValues(r, 1).legsWon).toBe(0)
  })

  it("sums every leg's final points, not just the last leg's board (it resets each leg)", () => {
    const r = play(
      { ...cfg(), firstTo: 2 },
      ['A', 'B'],
      [
        ...sweepWithOverkill,
        [MISS, MISS, MISS], // seat 1's turn to start leg 2; wasted so seat 0 sweeps again
        ...plainSweep,
      ],
    )
    expect(r.final.phase).toBe('finished')
    expect(r.final.legs).toEqual([2, 0])
    // Leg 1 scored 120 (the overkill), leg 2 scored 0 (plain sweep): the board's own total at
    // the end is only leg 2's, but the match total is both.
    expect(seatValues(r, 0).points).toBe(120)
  })
})
