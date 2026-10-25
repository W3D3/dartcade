import { describe, it, expect } from 'vitest'
import { cricketGame } from './cricket.js'
import type { CricketConfig, CricketState } from './cricket.js'
import type { BoardEvent } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'

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
