import { describe, it, expect } from 'vitest'
import { cricketGame, cricketModule } from './cricket.js'
import type { CricketConfig, CricketState } from './cricket.js'
import type { BoardEvent } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'
import type { CommittedVisit } from '../session/types.js'

const cfg: CricketConfig = { mode: 'standard', firstTo: 1, bullOff: 'off', botSpeed: 'normal', format: 'singles' }
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: CricketState, ...visits: [number, number][][]): CricketState {
  for (const v of visits) {
    s = cricketGame.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = cricketGame.onBoardEvent(s, dart(n, m, i)).state))
    s = cricketGame.onBoardEvent(s, takeout).state
  }
  return s
}

const duo = (c: Partial<CricketConfig> = {}) => cricketGame.init({ ...cfg, ...c }, [{ name: 'A' }, { name: 'B' }])
const T = (n: number): [number, number] => [n, 3]
const MISS: [number, number] = [0, 0]
const BULL: [number, number] = [50, 1]
const OUTER: [number, number] = [25, 1]
/** Seat 0 opens everything in 3 visits (B only misses in between). */
const sweep = (s: CricketState) =>
  play(s, [T(20), T(19), T(18)], [MISS, MISS, MISS], [T(17), T(16), T(15)], [MISS, MISS, MISS], [BULL, OUTER, MISS])
/** Opens everything for whoever is up in 3 visits (the other seat only misses in between). */
const sweepVisits = (s: CricketState) =>
  playVisits(s, [T(20), T(19), T(18)], [MISS, MISS, MISS], [T(17), T(16), T(15)], [MISS, MISS, MISS], [BULL, OUTER, MISS])

/** Like `play`, but also returns each visit's CommittedVisit record, as the engine's commit() builds it. */
function playVisits(s: CricketState, ...visits: [number, number][][]): { s: CricketState; visits: CommittedVisit<CricketState>[] } {
  const out: CommittedVisit<CricketState>[] = []
  for (const v of visits) {
    const start = cricketGame.onBoardEvent(s, opened).state
    let end = start
    v.forEach(([n, m], i) => (end = cricketGame.onBoardEvent(end, dart(n, m, i)).state))
    const after = cricketGame.onBoardEvent(end, takeout).state
    out.push({
      visit: out.length,
      seat: start.currentPlayer,
      leg: cricketGame.getLeg!(start),
      phase: 'game',
      committedAt: '2026-10-01T10:00:00.000Z',
      darts: [],
      start,
      end,
      after,
    })
    s = after
  }
  return { s, visits: out }
}

describe('a visit', () => {
  it('opens and scores for the thrower', () => {
    const s = play(duo(), [T(20), T(20), MISS])
    expect(s.board.marks[0][0]).toBe(3)
    expect(s.board.points).toEqual([60, 0])
    expect(s.lastVisit[0]).toEqual({ seat: 0, marks: 6, points: 60, darts: 3 })
    expect(s.currentPlayer).toBe(1)
  })
  it('counts every dart thrown, marks only when they open or score', () => {
    const s = play(duo(), [T(20), MISS, [14, 3]])
    expect(s.dartsThrown[0]).toBe(3)
    expect(s.marksScored[0]).toBe(3)
  })
})

describe('legs', () => {
  it('a leg ends on the winning dart; later darts are ignored', () => {
    let s = play(duo({ firstTo: 2 }), [T(20), T(19), T(18)], [MISS, MISS, MISS], [T(17), T(16), T(15)], [MISS, MISS, MISS])
    s = cricketGame.onBoardEvent(s, opened).state
    s = cricketGame.onBoardEvent(s, dart(50, 1, 0)).state
    s = cricketGame.onBoardEvent(s, dart(25, 1, 1)).state
    expect(s.legWonBy).toBe(0)
    s = cricketGame.onBoardEvent(s, dart(20, 3, 2)).state // ignored
    expect(s.board.points).toEqual([0, 0])
    s = cricketGame.onBoardEvent(s, takeout).state
    expect(s.legs).toEqual([1, 0])
    expect(s.board.marks[0].every(m => m === 0)).toBe(true)
    expect(s.currentPlayer).toBe(1) // leg 2 starts at the second position
    expect(s.phase).toBe('game')
  })
  it('first to N ends the match', () => {
    const s = sweep(duo())
    expect(s).toMatchObject({ phase: 'finished', winner: 0 })
  })
  it('opened everything but behind keeps throwing', () => {
    let s = play(duo(), [MISS, MISS, MISS], [T(20), T(20), MISS]) // B: 60
    s = play(s, [T(20), T(19), T(18)], [MISS, MISS, MISS], [T(17), T(16), T(15)], [MISS, MISS, MISS], [BULL, OUTER, MISS])
    expect(s.legWonBy).toBeNull()
    expect(s.phase).toBe('game')
  })
})

describe('teams', () => {
  it('seats of a team share one row of marks', () => {
    const four = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }, { name: 'B2' }]
    const s0 = cricketGame.init({ ...cfg, format: 'teams', teams: [0, 1, 0, 1] }, four)
    const s = play(s0, [[20, 1], MISS, MISS], [MISS, MISS, MISS], [[20, 2], MISS, MISS])
    expect(s.board.marks[0][0]).toBe(3)
    expect(s.marksScored).toEqual([1, 0, 2, 0])
  })
})

describe('corrections', () => {
  it('correcting the opening dart refolds the visit', () => {
    const start = duo()
    const before = refoldVisit(cricketGame, start, [opened, dart(20, 3, 0), dart(20, 3, 1)])
    expect(before.board.points).toEqual([60, 0])
    const after = refoldVisit(cricketGame, start, [opened, dart(20, 1, 0), dart(20, 3, 1)])
    expect(after.board.marks[0][0]).toBe(3)
    expect(after.board.points).toEqual([20, 0])
  })
})

describe('cut-throat', () => {
  it('points go to the opponent', () => {
    const s = play(duo({ mode: 'cutthroat' }), [T(20), T(20), MISS])
    expect(s.board.points).toEqual([0, 60])
  })
})

describe('config', () => {
  const two = [{ name: 'A' }, { name: 'B' }]
  it('takes the default config', () => {
    expect(cricketGame.validate?.(cfg, two)).toBeNull()
  })
  it('rejects an unknown mode, a first-to below 1 and a lopsided team game', () => {
    expect(cricketGame.validate?.({ ...cfg, mode: 'golf' as CricketConfig['mode'] }, two)).toBe('Unknown mode')
    expect(cricketGame.validate?.({ ...cfg, firstTo: 0 }, two)).toBe('First to must be at least 1')
    expect(cricketGame.validate?.({ ...cfg, format: 'teams', teams: [0, 0] }, two)).toMatch(/both teams/)
  })
})

describe('rounds', () => {
  it('a round ends when the turn gets back to the leg starter', () => {
    const s = play(duo(), [MISS, MISS, MISS], [MISS, MISS, MISS])
    expect(s).toMatchObject({ round: 2, currentPlayer: 0, turn: 0 })
  })
})

describe('view', () => {
  it('after one dart: marks, scorable (for the thrower, still up) and closed', () => {
    let s = duo()
    s = cricketGame.onBoardEvent(s, opened).state
    s = cricketGame.onBoardEvent(s, dart(20, 3, 0)).state
    const v = cricketGame.view(s, []) as any
    expect(v.marks[0][0]).toBe(3)
    expect(v.scorable[0]).toBe(true)
    expect(v.closed.every((c: boolean) => !c)).toBe(true)
  })

  it('a 2v2 view: both seats of a team share marks and points, and teams is present', () => {
    const four = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }, { name: 'B2' }]
    let s = cricketGame.init({ ...cfg, format: 'teams', teams: [0, 1, 0, 1] }, four)
    s = cricketGame.onBoardEvent(s, opened).state
    s = cricketGame.onBoardEvent(s, dart(20, 3, 0)).state
    const v = cricketGame.view(s, []) as any
    expect(v.marks[0]).toEqual(v.marks[2])
    expect(v.points[0]).toEqual(v.points[2])
    expect(v.teams).toHaveLength(2)
  })
})

describe('summarize', () => {
  it('a finished 2-player game: placements 1 and 2, exact mpr', () => {
    const s = sweep(duo())
    expect(s).toMatchObject({ phase: 'finished', winner: 0 })

    const results = cricketGame.summarize(s, { totalDarts: [9, 6], totalVisits: [3, 2] })
    expect(results[0]).toEqual({ placement: 1, stats: { mpr: 7, marksScored: 21, dartsThrown: 9, legsWon: 1, points: 0 } })
    expect(results[1]).toEqual({ placement: 2, stats: { mpr: 0, marksScored: 0, dartsThrown: 6, legsWon: 0, points: 0 } })
  })

  it('winner: null in cut-throat: the seat with fewer points ranks first', () => {
    const s = play(duo({ mode: 'cutthroat' }), [T(20), T(20), MISS])
    expect(s).toMatchObject({ phase: 'game', winner: null })
    expect(s.board.points).toEqual([0, 60])

    const results = cricketGame.summarize(s, { totalDarts: [3, 0], totalVisits: [1, 0] })
    expect(results.map(r => r.placement)).toEqual([1, 2])
  })

  it('winner: null, equal points: the seat with more targets opened ranks first', () => {
    const s = play(duo(), [T(20), MISS, MISS])
    expect(s).toMatchObject({ phase: 'game', winner: null })
    expect(s.board.points).toEqual([0, 0])

    const results = cricketGame.summarize(s, { totalDarts: [3, 0], totalVisits: [1, 0] })
    expect(results.map(r => r.placement)).toEqual([1, 2])
  })

  it('a 2v2: both seats of a team share the placement', () => {
    const four = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }, { name: 'B2' }]
    const s0 = cricketGame.init({ ...cfg, format: 'teams', teams: [0, 1, 0, 1] }, four)
    const s = play(s0, [T(20), MISS, MISS])

    const results = cricketGame.summarize(s, { totalDarts: [3, 0, 0, 0], totalVisits: [1, 0, 0, 0] })
    expect(results[0].placement).toBe(results[2].placement)
    expect(results[1].placement).toBe(results[3].placement)
    expect(results[0].placement).not.toBe(results[1].placement)
  })
})

describe('detail', () => {
  it('a 2-leg game: two legs, the right winners, the final marks', () => {
    const v1 = sweepVisits(duo({ firstTo: 3 }))
    expect(v1.s.legs).toEqual([1, 0])
    const v2 = sweepVisits(v1.s)
    expect(v2.s.legs).toEqual([1, 1])

    const d = cricketGame.detail([...v1.visits, ...v2.visits], v2.s)
    expect(d.legs).toHaveLength(2)
    expect(d.legs[0]).toMatchObject({ leg: 0, starter: 0, winner: 0 })
    expect(d.legs[1]).toMatchObject({ leg: 1, starter: 1, winner: 1 })
    expect(d.legs[0].marks).toEqual([
      [3, 3, 3, 3, 3, 3, 3],
      [0, 0, 0, 0, 0, 0, 0],
    ])
    expect(d.legs[1].marks).toEqual([
      [0, 0, 0, 0, 0, 0, 0],
      [3, 3, 3, 3, 3, 3, 3],
    ])
    expect(d.legs[0].points).toEqual([0, 0])
    expect(d.targets).toEqual([20, 19, 18, 17, 16, 15, 25])
  })

  it("cut-throat, 3 players: credits the leg to the team whose legs rose, even on another team's dart", () => {
    // A opens 20, scoring onto B and C. B opens 19/18/17/16/15, then the bull (with A still on 0
    // points, B isn't the lowest yet). C's dart on 18 (already open) is the one that finally
    // leaves B as the sole lowest score and wins the leg — not C's own team.
    const s0 = cricketGame.init({ ...cfg, mode: 'cutthroat' }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    const { s, visits } = playVisits(
      s0,
      [T(20), [20, 1]],
      [T(20), T(19), T(18)],
      [MISS, MISS, MISS],
      [MISS, MISS, MISS],
      [T(17), T(16), T(15)],
      [MISS, MISS, MISS],
      [MISS, MISS, MISS],
      [OUTER, [25, 2]],
      [T(18), T(18)],
    )
    expect(visits.at(-1)?.seat).toBe(2) // the winning visit was C's
    expect(s.legs).toEqual([0, 1, 0]) // B's team won
    expect(s.winner).toBe(1)

    const d = cricketGame.detail(visits, s)
    expect(d.legs[0].winner).toBe(1)
  })
})

describe('cricketModule (with a bull off)', () => {
  it('stages a bull off before the game starts', () => {
    const s = cricketModule.init({ ...cfg, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
    expect(s.stage).toBe('bulloff')
  })
})
