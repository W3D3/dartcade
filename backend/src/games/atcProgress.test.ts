import { describe, it, expect } from 'vitest'
import { atcModule, type ATCState } from './atc.js'
import { atcProgress } from './atcProgress.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Segment } from '../session/types.js'

const seg = (number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name: multiplier === 0 ? 'Miss' : `${['', 'S', 'D', 'T'][multiplier]}${number}`,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const MISS = seg(0, 0)
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
const base = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' } as const

function play(cfg: typeof base | Record<string, unknown>, players: number, throws: Segment[][]) {
  let s = atcModule.init(
    cfg as never,
    Array.from({ length: players }, (_, i) => ({ name: `P${i}` })),
  )
  const visits: CommittedVisit<ATCState>[] = []
  throws.forEach((darts, n) => {
    const seat = s.currentPlayer
    const start = atcModule.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
    let end = start
    darts.forEach((d, i) => {
      end = atcModule.onBoardEvent(end, dartEvent(d, i)).state
    })
    const after = atcModule.onBoardEvent(end, { kind: 'takeout.finished', data: {} }).state
    visits.push({ visit: n, seat, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: darts.map(hd), start, end, after })
    s = after
  })
  return { visits, final: s }
}

describe('atcProgress', () => {
  it('counts darts per target and ends on the target the game stopped at', () => {
    const r = play(base, 2, [
      [MISS, seg(1, 1), seg(2, 1)], // P0: 1 in 2 darts, 2 in 1
      [MISS, MISS, MISS], // P1: 3 darts at 1
      [MISS, MISS, MISS], // P0: 3 darts at 3
    ])
    expect(atcProgress(r.visits, r.final)).toEqual([
      {
        seat: 0,
        steps: [
          { target: 1, darts: 2, hit: true },
          { target: 2, darts: 1, hit: true },
          { target: 3, darts: 3, hit: false },
        ],
      },
      { seat: 1, steps: [{ target: 1, darts: 3, hit: false }] },
    ])
  })

  it('lists targets a multiplier skips as hit with no darts', () => {
    const r = play({ ...base, multiplierAdvances: true }, 1, [[seg(1, 3)]]) // T1: 1, 2, 3 done
    expect(atcProgress(r.visits, r.final)[0].steps.slice(0, 4)).toEqual([
      { target: 1, darts: 1, hit: true },
      { target: 2, darts: 0, hit: true },
      { target: 3, darts: 0, hit: true },
      { target: 4, darts: 0, hit: false },
    ])
  })
})

describe('ATC matchStats', () => {
  it('counts hits, first-dart hits, streaks, darts per target and the hardest target', () => {
    const r = play(base, 2, [
      [seg(1, 1), seg(2, 1), MISS], // P0: 1 and 2 first dart, streak 2
      [MISS, MISS, seg(1, 1)], // P1: 1 on the third dart
      [MISS, MISS, seg(3, 1)], // P0: 3 on the third dart (hardest)
      [seg(2, 1), seg(3, 1), seg(4, 1)], // P1: hits 2, 3, 4; with the 1 that ended their last visit, a streak of 4
    ])
    const m = atcModule.matchStats!(r.visits, r.final)
    const p0 = m.seats.find(s => s.index === 0)!.values
    const p1 = m.seats.find(s => s.index === 1)!.values
    expect(p0).toMatchObject({
      dartsThrown: 6,
      targetsHit: 3,
      dartsHit: 3,
      firstDartHits: 2,
      longestStreak: 2,
      hardestTarget: 3,
      reached: 4,
      finished: 0,
    })
    expect(p0.dartsPerTarget).toBeCloseTo(6 / 3)
    expect(p1).toMatchObject({ dartsThrown: 6, targetsHit: 4, dartsHit: 4, firstDartHits: 3, longestStreak: 4, hardestTarget: 1 })
    expect(m.rows.find(x => x.key === 'hitRate')).toMatchObject({ format: 'ratio', value: 'dartsHit', of: 'dartsThrown' })
  })

  it('keeps the hit rate at or under 100% when a multiplier skips targets', () => {
    const r = play({ ...base, multiplierAdvances: true }, 1, [[seg(1, 3), seg(4, 3)]]) // 2 darts, 6 targets
    const v = atcModule.matchStats!(r.visits, r.final).seats[0].values
    expect(v.dartsHit).toBe(2)
    expect(v.targetsHit).toBe(6)
  })

  it('leaves out the hardest target for a seat that hit nothing', () => {
    const r = play(base, 1, [[MISS, MISS, MISS]])
    expect(atcModule.matchStats!(r.visits, r.final).seats[0].values.hardestTarget).toBeUndefined()
  })

  it('counts darts thrown after the finishing dart, in the same visit', () => {
    // A single-target game: the first dart wins, but two more darts still land in that visit.
    const mkState = (targets: number[], winner: number | null = null): ATCState => ({
      sequence: [1],
      targets,
      currentPlayer: 0,
      allHitThisVisit: false,
      winner,
      cfg: base,
      playerCount: 1,
      currentVisitHits: [],
    })
    const start = mkState([1])
    const end = mkState([2], 0)
    const visits: CommittedVisit<ATCState>[] = [
      {
        visit: 0,
        seat: 0,
        leg: 0,
        phase: 'game',
        committedAt: '2026-10-01T10:00:00.000Z',
        darts: [hd(seg(1, 1), 0), hd(MISS, 1), hd(MISS, 2)],
        start,
        end,
        after: end,
      },
    ]
    const v = atcModule.matchStats!(visits, end).seats[0].values
    expect(v.dartsThrown).toBe(3)
    expect(v.dartsPerTarget).toBeCloseTo(3)
  })
})
