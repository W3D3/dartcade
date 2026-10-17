import { describe, it, expect } from 'vitest'
import { hiloGame, judge, compareSeats, type HiloConfig, type HiloState } from './hilo.js'
import type { BoardEvent } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'

const cfg: HiloConfig = { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true, bullOff: 'off' }
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: HiloState, ...visits: [number, number][][]): HiloState {
  for (const v of visits) {
    s = hiloGame.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = hiloGame.onBoardEvent(s, dart(n, m, i)).state))
    s = hiloGame.onBoardEvent(s, takeout).state
  }
  return s
}

const duo = (c: Partial<HiloConfig> = {}) => hiloGame.init({ ...cfg, ...c }, [{ name: 'A' }, { name: 'B' }])
const T20: [number, number] = [20, 3],
  S20: [number, number] = [20, 1],
  S1: [number, number] = [1, 1],
  MISS: [number, number] = [0, 0]

describe('judge', () => {
  it.each([
    [60, 41, 21, true, 'high'],
    [41, 41, 21, true, 'between'],
    [21, 41, 21, true, 'between'],
    [20, 41, 21, true, 'low'],
    [180, 180, 21, true, 'high'],
    [180, 180, 21, false, 'between'],
    [0, 60, 0, true, 'low'],
    [0, 60, 0, false, 'between'],
  ] as const)('%i on %i/%i, extremes %s → %s', (t, high, low, matchExtremes, out) => {
    expect(judge(t, high, low, { ...cfg, matchExtremes })).toBe(out)
  })
})

describe('a visit', () => {
  it('above the high bar sets it', () => {
    const s = play(duo(), [T20, S1, S1]) // 62
    expect(s).toMatchObject({ high: 62, low: 21, currentPlayer: 1 })
    expect(s.visits[0]).toEqual({ seat: 0, round: 1, total: 62, outcome: 'high', high: 62, low: 21 })
  })
  it('below the low bar sets it', () => expect(play(duo(), [S1, S1, [5, 1]]).low).toBe(7))
  it('between costs a life, bars stay', () => {
    const s = play(duo(), [S20, [5, 1], [5, 1]]) // 30
    expect(s).toMatchObject({ high: 41, low: 21, lives: [2, 3] })
    expect(s.lastResult).toEqual({ seat: 0, total: 30, outcome: 'between', high: 41, low: 21 })
  })
  it('a miss below the high bar costs a life and locks the visit', () => {
    let s = hiloGame.onBoardEvent(duo(), opened).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 0)).state
    s = hiloGame.onBoardEvent(s, dart(0, 0, 1)).state
    expect(s.missed).toBe(true)
    s = hiloGame.onBoardEvent(s, dart(20, 3, 2)).state // ignored
    s = hiloGame.onBoardEvent(s, takeout).state
    expect(s).toMatchObject({ lives: [2, 3], high: 41, low: 21 })
    expect(s.visits[0].outcome).toBe('miss')
  })
  it('a miss already under the low bar still costs a life', () => {
    expect(play(duo(), [S1, MISS, S1]).lives).toEqual([2, 3])
  })
  it('a miss once safe high is harmless', () => {
    const s = play(duo(), [T20, MISS, MISS])
    expect(s).toMatchObject({ high: 60, lives: [3, 3] })
  })
  it('an early takeout: a life unless safe high', () => {
    expect(play(duo(), [S1]).lives).toEqual([2, 3])
    expect(play(duo(), [T20]).high).toBe(60)
  })
  it('T1 counts as 0 with the option', () => {
    expect(
      play(duo({ t1Zero: true, startLow: 1 }), [
        [1, 3],
        [1, 3],
        [1, 3],
      ]).low,
    ).toBe(0)
    expect(play(duo({ startLow: 10 }), [[1, 3], [1, 3], S1]).low).toBe(7)
  })
})

describe('turns and the end', () => {
  it('skips players who are out, rounds count up, the last one in wins', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    let s = play(g, [S20, [5, 1], [5, 1]]) // A out (30 between)
    s = play(s, [T20, S1, S1]) // B 62 high
    expect(s.currentPlayer).toBe(2)
    s = play(s, [S20, S20, S20]) // C 60, between 21 and 62 → out
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })
    expect(s.outAt).toEqual([0, null, 2])
  })
  it('round increments when play wraps', () => {
    const s = play(duo(), [T20, S1, S1], [S1, S1, S1])
    expect(s.round).toBe(2)
  })
  it('compareSeats: in before out, more lives first, later out first', () => {
    const s = { ...duo(), lives: [0, 2, 0, 1], outAt: [3, null, 5, null] }
    const order = [0, 1, 2, 3].sort((a, b) => compareSeats(s, a, b))
    expect(order).toEqual([1, 3, 2, 0])
  })
})

describe('corrections', () => {
  it('correcting the miss into a segment unlocks the visit on refold', () => {
    const start = hiloGame.onBoardEvent(duo(), opened).state
    expect(refoldVisit(hiloGame, duo(), [opened, dart(0, 0, 0)]).missed).toBe(true)
    expect(refoldVisit(hiloGame, duo(), [opened, dart(20, 1, 0)]).missed).toBe(false)
    void start
  })
})

describe('validate', () => {
  const two = [{ name: 'A' }, { name: 'B' }]
  it('passes the defaults', () => expect(hiloGame.validate!(hiloGame.defaultConfig, two)).toBeNull())
  it('refuses bad setups', () => {
    expect(hiloGame.validate!(cfg, [{ name: 'A' }])).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startLow: 41 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startHigh: 181 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: 8 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: '3' as unknown as number }, two)).not.toBeNull()
  })
})
