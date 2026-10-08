import { describe, it, expect } from 'vitest'
import { x01Game, x01Module, type X01Config, type X01State } from './x01.js'
import { atcModule, type ATCState } from './atc.js'
import type { CommittedVisit, HistoryDart, BoardEvent, Segment } from '../session/types.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const T20 = seg('T20', 20, 3),
  S20 = seg('S20', 20, 1),
  S1 = seg('S1', 1, 1)
const dartEvent = (s: Segment, index: number): BoardEvent => ({
  kind: 'dart.detected',
  data: { visit_id: 'v', index, source_seq: 0, dart: { segment: s, score: s.number * s.multiplier } },
})

const cfg: X01Config = {
  startScore: 301,
  inMode: 'straight',
  outMode: 'straight',
  bullOff: 'off',
  botSpeed: 'normal',
  bullValue: '25_50',
  maxRounds: 50,
  firstTo: 1,
}
const players = [{ name: 'A' }, { name: 'B' }]

function visit(s: X01State, darts: Segment[], closing: 'takeout.finished' | 'visit.cleared' = 'takeout.finished'): X01State {
  let st = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
  darts.forEach((d, i) => {
    st = x01Game.onBoardEvent(st, dartEvent(d, i)).state
  })
  return x01Game.onBoardEvent(st, { kind: closing, data: {} }).state
}

describe('X01 pointsScored', () => {
  it('adds what a visit scored and nothing for a bust', () => {
    let s = x01Game.init(cfg, players)
    s = visit(s, [T20, T20, T20]) // A: 180, 121 left
    s = visit(s, [S20]) // B: 20
    s = visit(s, [T20, T20, T20]) // A: 180 > 121, bust
    expect(s.pointsScored).toEqual([180, 20])
  })
  it('counts a visit closed by visit.cleared and the checkout visit', () => {
    let s = x01Game.init(cfg, players)
    s = visit(s, [T20, T20, T20]) // A 121 left
    s = visit(s, [S1], 'visit.cleared') // B: 1
    s = visit(s, [T20, T20, S1]) // A checks out 121
    expect(s.pointsScored).toEqual([301, 1])
    expect(s.winner).toBe(0)
  })

  it('does not double count the previous visit when a board.resync drops the next visit.opened', () => {
    // The engine clears the open visit (including a pending visit.opened) on a
    // board.resync (see apply.ts applyBoardEvent 'board.resync'); the next visit's
    // darts then arrive straight after a commit, with no visit.opened in between.
    const solo = [{ name: 'Solo' }]
    let s = x01Game.init({ ...cfg, firstTo: 5 }, solo)
    s = visit(s, [T20, T20, T20]) // 180 scored, 121 left
    // No visit.opened here: simulates a resync swallowing it.
    s = x01Game.onBoardEvent(s, dartEvent(S20, 0)).state
    s = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} }).state
    expect(s.scores).toEqual([101])
    // 180 + 20 actually scored; the bug would also re-add the 180 from the first visit.
    expect(s.pointsScored).toEqual([200])
  })

  it('does not double count the previous visit when a resync leaves the next visit empty', () => {
    const solo = [{ name: 'Solo' }]
    let s = x01Game.init({ ...cfg, firstTo: 5 }, solo)
    s = visit(s, [T20, T20, T20]) // 180 scored, 121 left
    // The resync swallowed the visit and the board closes it with no darts
    s = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} }).state
    expect(s.scores).toEqual([121])
    expect(s.pointsScored).toEqual([180])
  })
})

describe('X01 best checkout', () => {
  it('keeps the highest checkout per player, and no stat without one', () => {
    let s = x01Game.init({ ...cfg, firstTo: 2 }, players)
    s = visit(s, [T20, T20, T20]) // A: 121 left
    s = visit(s, [S20]) // B
    s = visit(s, [T20, T20, S1]) // A checks out 121, leg 1
    expect(s.bestCheckout).toEqual([121, 0])
    const r = x01Game.summarize({ ...s, winner: 0 }, { totalDarts: [6, 4], totalVisits: [2, 2] })
    expect(r[0].stats.bestCheckout).toBe(121)
    expect(r[1].stats).not.toHaveProperty('bestCheckout')
  })

  it('reports the throw order', () => {
    const s = x01Game.init(cfg, players)
    expect(x01Game.throwOrder?.({ ...s, order: [1, 0] })).toEqual([1, 0])
  })
})

describe('X01 summarize', () => {
  const base = x01Game.init({ ...cfg, firstTo: 3 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
  it('ranks by legs, then remaining score, winner first', () => {
    const s = { ...base, legs: [1, 3, 0], scores: [40, 0, 100], winner: 1, pointsScored: [300, 900, 150] }
    const r = x01Game.summarize(s, { totalDarts: [12, 30, 9], totalVisits: [4, 10, 3] })
    expect(r.map(x => x.placement)).toEqual([2, 1, 3])
    expect(r[1].stats).toEqual({ average: 90, dartsThrown: 30, legsWon: 3, pointsScored: 900 })
    expect(r[2].stats.average).toBeCloseTo(50)
  })
  it('keeps a round-limit winner with fewer legs first', () => {
    const s = { ...base, playerCount: 2, legs: [2, 0], scores: [200, 20], winner: 1, pointsScored: [0, 0] }
    expect(x01Game.summarize(s, { totalDarts: [0, 0], totalVisits: [0, 0] }).map(x => x.placement)).toEqual([2, 1])
  })
  it('an average without darts is 0', () => {
    const s = { ...base, playerCount: 1, legs: [1], scores: [0], winner: 0, pointsScored: [0] }
    expect(x01Game.summarize(s, { totalDarts: [0], totalVisits: [0] })[0].stats.average).toBe(0)
  })
})

const hd = (s: Segment, index: number): HistoryDart => ({
  index,
  segment: s,
  coords: null,
  source: 'camera',
  corrected: false,
  thrownAt: '2026-10-01T10:00:00.000Z',
})

describe('X01 detail', () => {
  const c2 = { ...cfg, firstTo: 2 }
  const s0 = x01Game.init(c2, players)
  const cv = (
    visit: number,
    seat: number,
    leg: number,
    start: X01State,
    end: X01State,
    after: X01State,
    darts: HistoryDart[],
    phase: 'game' | 'bulloff' = 'game',
  ): CommittedVisit<X01State> => ({ visit, seat, leg, phase, committedAt: '2026-10-01T10:00:00.000Z', darts, start, end, after })

  it('groups visits by leg with starter, winner, scored, remaining and bust', () => {
    const v0end = { ...s0, scores: [121, 301] }
    const v0after = { ...v0end, currentPlayer: 1 }
    const v1end = { ...v0after, scores: [121, 301], bustThisVisit: true }
    const v1after = { ...v1end, currentPlayer: 0, bustThisVisit: false }
    const v2end = { ...v1after, scores: [0, 301] }
    const v2after = { ...v2end, legs: [1, 0], scores: [301, 301] }
    const d = x01Game.detail(
      [
        cv(0, 0, 0, s0, v0end, v0after, [hd(T20, 0), hd(T20, 1), hd(T20, 2)]),
        cv(1, 1, 0, v0after, v1end, v1after, [hd(T20, 0)]),
        cv(2, 0, 0, v1after, v2end, v2after, [hd(T20, 0), hd(T20, 1), hd(S1, 2)]),
        cv(3, 1, 1, v2after, v2after, v2after, []),
      ],
      v2after,
    )
    expect(d.mode).toBe('x01')
    expect(d.legs).toHaveLength(2)
    expect(d.legs[0]).toMatchObject({ leg: 0, starter: 0, winner: 0 })
    expect(d.legs[0].visits.map(v => [v.seat, v.scored, v.remaining, v.bust])).toEqual([
      [0, 180, 121, false],
      [1, 0, 301, true],
      [0, 121, 0, false],
    ])
    expect(d.legs[1]).toMatchObject({ leg: 1, starter: 1, winner: null })
  })

  it('leaves bull off visits out', () => {
    const d = x01Game.detail([cv(0, 1, 0, s0, s0, s0, [hd(S20, 0)], 'bulloff')], s0)
    expect(d.legs).toEqual([])
  })
})

describe('withBullOff passes the hooks to the game', () => {
  it('summarize, getLeg, detail and version', () => {
    const wrapped = x01Module.init({ ...cfg, bullOff: 'off' }, players)
    const inner = { ...wrapped.game, legs: [1, 0], winner: 0 }
    const s = { ...wrapped, game: inner }
    expect(x01Module.version).toBe(x01Game.version)
    expect(x01Module.getLeg?.(s)).toBe(1)
    expect(x01Module.summarize(s, { totalDarts: [3, 3], totalVisits: [1, 1] }).map(r => r.placement)).toEqual([1, 2])
    const d = x01Module.detail(
      [
        {
          visit: 0,
          seat: 0,
          leg: 0,
          phase: 'game',
          committedAt: '2026-10-01T10:00:00.000Z',
          darts: [],
          start: wrapped,
          end: wrapped,
          after: wrapped,
        },
      ],
      wrapped,
    )
    expect(d.legs[0].visits[0]).toMatchObject({ seat: 0, scored: 0, remaining: 301 })
  })
})

describe('ATC summarize and detail', () => {
  const cfgAtc = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' } as const
  const s0 = atcModule.init(cfgAtc, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])

  it('ranks by targets completed, then fewer darts, winner first', () => {
    const s: ATCState = { ...s0, targets: [21, 5, 5], winner: 0 }
    const r = atcModule.summarize(s, { totalDarts: [40, 30, 33], totalVisits: [14, 10, 11] })
    expect(r.map(x => x.placement)).toEqual([1, 2, 3])
    // All 20 targets done: finished, so it counts as darts to finish; the others didn't finish
    expect(r[0].stats).toEqual({ dartsThrown: 40, targetsHit: 20, dartsToFinish: 40 })
    expect(r[1].stats).toEqual({ dartsThrown: 30, targetsHit: 4 })
  })

  it('describes each visit: hits and targets before/after', () => {
    const start: ATCState = { ...s0, currentVisitHits: [] }
    const end: ATCState = { ...s0, targets: [3, 1, 1], currentVisitHits: [true, false, true] }
    const d = atcModule.detail(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [hd(S1, 0)], start, end, after: end }],
      end,
    )
    expect(d).toEqual({
      mode: 'atc',
      visits: [
        { visit: 0, seat: 0, committedAt: '2026-10-01T10:00:00.000Z', darts: [hd(S1, 0)], hits: 2, targetBefore: 1, targetAfter: 3 },
      ],
      progress: [],
    })
  })
})
