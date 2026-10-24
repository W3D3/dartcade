import { describe, it, expect } from 'vitest'
import { x01Game, type X01Config, type X01State } from './x01.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Segment } from '../session/types.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const T20 = seg('T20', 20, 3),
  T19 = seg('T19', 19, 3),
  S20 = seg('S20', 20, 1),
  S1 = seg('S1', 1, 1),
  D2 = seg('D2', 2, 2),
  D10 = seg('D10', 10, 2),
  MISS = seg('Miss', 0, 0)

const cfg = (over: Partial<X01Config> = {}): X01Config => ({
  startScore: 301,
  inMode: 'straight',
  outMode: 'double',
  bullOff: 'off',
  botSpeed: 'normal',
  bullValue: '25_50',
  maxRounds: 50,
  firstTo: 1,
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

/**
 * Plays visits in order (whoever is up throws each); returns the committed visits and the final
 * state. An empty dart list closes the visit with `visit.cleared` (no darts) instead of
 * `takeout.finished`, matching how a cleared visit with nothing thrown is committed.
 */
function play(c: X01Config, names: string[], throws: Segment[][]): { visits: CommittedVisit<X01State>[]; final: X01State } {
  let s = x01Game.init(
    c,
    names.map(name => ({ name })),
  )
  const visits: CommittedVisit<X01State>[] = []
  throws.forEach((darts, n) => {
    const seat = s.currentPlayer
    const leg = x01Game.getLeg?.(s) ?? 0
    const start = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
    let end = start
    darts.forEach((d, i) => {
      end = x01Game.onBoardEvent(end, dartEvent(d, i)).state
    })
    const closing = darts.length === 0 ? ({ kind: 'visit.cleared', data: {} } as const) : ({ kind: 'takeout.finished', data: {} } as const)
    const after = x01Game.onBoardEvent(end, closing).state
    visits.push({ visit: n, seat, leg, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: darts.map(hd), start, end, after })
    s = after
  })
  return { visits, final: s }
}

const statsOf = (r: ReturnType<typeof play>) => x01Game.matchStats!(r.visits, r.final)
const seatValues = (r: ReturnType<typeof play>, seat: number) => statsOf(r).seats.find(v => v.index === seat)!.values

describe('X01 matchStats', () => {
  it('declares the rows in the spec order', () => {
    const r = play(cfg(), ['A'], [])
    expect(statsOf(r).rows.map(x => x.key)).toEqual([
      'average',
      'first9Average',
      'checkout',
      'highestFinish',
      'highestScore',
      'count180',
      'count140',
      'count100',
      'bestLegDarts',
      'dartsThrown',
    ])
    expect(statsOf(r).rows.find(x => x.key === 'checkout')).toMatchObject({
      format: 'ratio',
      value: 'checkoutHits',
      of: 'checkoutAttempts',
    })
  })

  it('counts averages, first 9, tiers and highest score; nothing to finish yet', () => {
    const r = play(
      cfg(),
      ['A', 'B'],
      [
        [T20, T20, T20], // A 180 → 121
        [S20, S20, S1], // B 41 → 260
        [T19, S20, MISS], // A 77 → 44
        [S20, S1, S1], // B 22 → 238
        [S20, S1, MISS], // A 21 → 23
        [S1, S1, S1], // B 3 → 235
        [S1, MISS, MISS], // A 1 → 22 (first 9 stops before this visit)
      ],
    )
    const a = seatValues(r, 0)
    expect(a.dartsThrown).toBe(12)
    expect(a.average).toBeCloseTo(((180 + 77 + 21 + 1) / 12) * 3)
    expect(a.first9Average).toBeCloseTo(((180 + 77 + 21) / 9) * 3)
    expect(a.count180).toBe(1)
    expect(a.count140).toBe(0)
    expect(a.count100).toBe(0)
    expect(a.highestScore).toBe(180)
    expect(a.highestFinish).toBeUndefined()
    expect(a.bestLegDarts).toBeUndefined()
  })

  it('takes checkout hits and attempts from the live counting, finish and best leg from the checkout', () => {
    const r = play(
      cfg(),
      ['A', 'B'],
      [
        [T20, T20, T20], // A → 121
        [S1, S1, S1], // B → 298
        [T20, T20, MISS], // A: 121 − 120 = 1, a dead end under double out → bust, 121 stays
        [S1, S1, S1], // B → 295
        [T20, T19, D2], // A checks out 121: 60 + 57 + 4
      ],
    )
    const a = seatValues(r, 0)
    expect(a.highestFinish).toBe(121)
    expect(a.bestLegDarts).toBe(9)
    expect(a.checkoutHits).toBe(1)
    expect(a.checkoutAttempts).toBe(r.final.checkoutAttempts[0])
    // The bust visit scored 0: 180 + 0 + 121 over 9 darts
    expect(a.average).toBeCloseTo(((180 + 121) / 9) * 3)
    expect(a.highestScore).toBe(180)
    expect(a.count100).toBe(1) // the 121 checkout
    expect(seatValues(r, 1).bestLegDarts).toBeUndefined()
    expect(seatValues(r, 1).highestFinish).toBeUndefined()
  })

  it('puts each visit in one tier', () => {
    const r = play(
      cfg({ startScore: 701 }),
      ['A'],
      [
        [T20, T20, T20], // 180
        [T20, T20, S20], // 140
        [T20, S20, S20], // 100
        [T20, T20, T19], // 177 → 140 tier
      ],
    )
    expect(seatValues(r, 0)).toMatchObject({ count180: 1, count140: 2, count100: 1 })
  })

  it('scores nothing before opening under double in', () => {
    const r = play(
      cfg({ inMode: 'double' }),
      ['A'],
      [
        [T20, T20, T20], // not opened: 0
        [D10, T20, T20], // opens on D10: 20 + 60 + 60 = 140
      ],
    )
    const a = seatValues(r, 0)
    expect(a.highestScore).toBe(140)
    expect(a.count180).toBe(0)
    expect(a.count140).toBe(1)
  })

  it('does not let an empty cleared visit take a first-9 slot', () => {
    const r = play(
      cfg(),
      ['A'],
      [
        [T20, T20, T20], // A 180 → 121, first 9 slot 1
        [], // cleared with nothing thrown: must not take a slot
        [T19, S20, MISS], // A 77 → 44, first 9 slot 2
        [S20, S1, S1], // A 22 → 22, first 9 slot 3 — must not be pushed out
      ],
    )
    const a = seatValues(r, 0)
    expect(a.first9Average).toBeCloseTo(((180 + 77 + 22) / 9) * 3)
  })

  it('gives team totals from the parts and legs closed per player', () => {
    const r = play(
      cfg({ format: 'teams', teams: [0, 1, 0, 1] }),
      ['A', 'B', 'C', 'D'],
      [
        [T20, T20, T20], // team of seat 0: 180 → 121
        [S1, S1, S1],
        [T20, T19, D2], // the other player of the first team checks out 121: 60 + 57 + 4
      ],
    )
    const s = statsOf(r)
    expect(s.teams).toHaveLength(2)
    const team0 = s.teams!.find(t => t.index === r.final.teamOf[0])!.values
    expect(team0.dartsThrown).toBe(6)
    expect(team0.average).toBeCloseTo(((180 + 121) / 6) * 3)
    expect(team0.legsWon).toBe(1)
    const closer = r.visits[2].seat
    expect(s.seats.find(v => v.index === closer)!.values.legsClosed).toBe(1)
    expect(s.seats.find(v => v.index === 0)!.values.legsClosed).toBe(0)
  })
})

describe('X01 matchStats per leg', () => {
  const D20 = seg('D20', 20, 2)
  const twoLegs = () =>
    play(
      cfg({ startScore: 101, firstTo: 2 }),
      ['A', 'B'],
      [
        [T20, S1, MISS], // leg 1, A 61 → 40: the miss is a dart at the finish
        [T20, T20, MISS], // B busts on the second dart: 101 stays
        [MISS, MISS, D20], // A: three more darts at it, the last checks out
        [T20, T20, T20], // leg 2: busts on the second dart
        [S20, S20, S1], // 41 → 60
        [S20, S20, D10], // 60 → 41: nobody has checked out leg 2 yet
      ],
    )
  const legValues = (r: ReturnType<typeof play>, leg: number, seat: number) =>
    statsOf(r)
      .legs!.find(l => l.leg === leg)!
      .seats.find(v => v.index === seat)!.values

  it('gives every leg the match rows without best leg', () => {
    const s = statsOf(twoLegs())
    expect(s.legs!.map(l => l.leg)).toEqual([0, 1])
    expect(s.legs![0].rows.map(x => x.key)).toEqual(s.rows.map(x => x.key).filter(k => k !== 'bestLegDarts'))
  })

  it('counts each leg from its own visits, checkout darts included', () => {
    const r = twoLegs()
    expect(legValues(r, 0, 0)).toMatchObject({ dartsThrown: 6, checkoutAttempts: 4, checkoutHits: 1, highestFinish: 40 })
    expect(legValues(r, 0, 0).average).toBeCloseTo(((61 + 40) / 6) * 3)
    // The bust scored nothing, and B never had a dart at a finish
    expect(legValues(r, 0, 1)).toMatchObject({ dartsThrown: 3, average: 0, checkoutAttempts: 0, checkoutHits: 0 })
    // The match adds the legs up, and agrees with the live counting
    const match = seatValues(r, 0)
    expect(match.checkoutAttempts).toBe(r.final.checkoutAttempts[0])
    expect(match.dartsThrown).toBe(legValues(r, 0, 0).dartsThrown + legValues(r, 1, 0).dartsThrown)
  })

  it('leaves the finish out of a leg nobody checked out, busts scoring nothing', () => {
    const r = twoLegs()
    const opener = r.visits[3].seat
    const leg = legValues(r, 1, opener)
    expect(leg.dartsThrown).toBe(6)
    expect(leg.average).toBeCloseTo((60 / 6) * 3)
    expect(leg.highestFinish).toBeUndefined()
    expect(leg.checkoutAttempts).toBe(0)
    expect(legValues(r, 1, 1 - opener)).toMatchObject({ dartsThrown: 3, highestScore: 41 })
  })

  it('gives team totals per leg', () => {
    const r = play(
      cfg({ format: 'teams', teams: [0, 1, 0, 1] }),
      ['A', 'B', 'C', 'D'],
      [
        [T20, T20, T20],
        [S1, S1, S1],
        [T20, T19, D2],
      ],
    )
    const s = statsOf(r)
    const t = r.final.teamOf[0]
    const leg = s.legs![0].teams!.find(v => v.index === t)!.values
    const { legsWon: _won, ...match } = s.teams!.find(v => v.index === t)!.values
    expect(leg).toEqual(match)
    expect(s.legs![0].teams).toHaveLength(2)
  })
})
