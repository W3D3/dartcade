import { describe, it, expect } from 'vitest'
import { catch40Game, catch40Module, pointsFor, totalOf, TARGETS, type Catch40State } from './catch40.js'
import type { BoardEvent } from '../session/types.js'

const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: Catch40State, ...visits: [number, number][][]): Catch40State {
  for (const v of visits) {
    s = catch40Game.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = catch40Game.onBoardEvent(s, dart(n, m, i)).state))
    s = catch40Game.onBoardEvent(s, takeout).state
  }
  return s
}
const init = (n = 1) => catch40Game.init({ bullOff: 'off' }, Array.from({ length: n }, (_, i) => ({ name: `P${i}` })))
const MISS: [number, number] = [0, 0]
const miss3 = [MISS, MISS, MISS]
const BULL: [number, number] = [25, 2]

describe('pointsFor', () => {
  it.each([
    [70, 1, 3],
    [70, 2, 3],
    [70, 3, 2],
    [70, 4, 1],
    [70, 6, 1],
    [70, null, 0],
    [99, 3, 3],
    [99, 4, 1],
    [98, 3, 2],
  ])('target %i in %s darts scores %i', (target, darts, points) => {
    expect(pointsFor(target, darts)).toBe(points)
  })
})

describe('a target', () => {
  it('a 2-dart checkout scores 3 and moves to 62', () => {
    // 61: T19 (57) then D2
    const s = play(init(), [[19, 3], [2, 2]])
    expect(s.seats[0].tries).toEqual([{ target: 61, darts: 2, points: 3, finish: 'D2' }])
    expect(s.seats[0].left).toBe(62)
    expect(s.lastResult).toEqual({ seat: 0, target: 61, darts: 2, points: 3 })
  })

  it('a 3-dart checkout scores 2', () => {
    const s = play(init(), [[20, 1], [1, 1], [20, 2]])
    expect(s.seats[0].tries[0]).toMatchObject({ darts: 3, points: 2 })
  })

  it('a checkout in the second visit uses 4-6 darts and scores 1', () => {
    // 61: 20 -> 41, miss, miss; then 1 -> 40, D20
    const s = play(init(), [[20, 1], MISS, MISS], [[1, 1], [20, 2]])
    expect(s.seats[0].tries[0]).toMatchObject({ darts: 5, points: 1, finish: 'D20' })
  })

  it('no checkout within 6 darts scores 0 and moves on', () => {
    const s = play(init(), miss3, miss3)
    expect(s.seats[0].tries[0]).toEqual({ target: 61, darts: 6, points: 0, finish: null })
    expect(s.seats[0].left).toBe(62)
  })

  it('the open target survives a visit that did not finish it', () => {
    const s = play(init(), [[20, 1], MISS, MISS])
    expect(s.seats[0].tries).toHaveLength(0)
    expect(s.seats[0]).toMatchObject({ left: 41, darts: 3 })
  })

  it('99 checked out in 3 darts scores 3', () => {
    let s = init()
    s = { ...s, seats: [{ ...s.seats[0], tries: Array.from({ length: 38 }, (_, i) => ({ target: 61 + i, darts: 6, points: 0, finish: null })), left: 99 }] }
    s = play(s, [[19, 3], [20, 1], [11, 2]].map(d => d as [number, number]))
    // 99 - 57 = 42, - 20 = 22, D11
    expect(s.seats[0].tries[38]).toMatchObject({ target: 99, darts: 3, points: 3 })
  })
})

describe('busts (double out, as X01)', () => {
  it.each([
    ['going below zero or reaching 0 on a triple', [20, 3]],
  ])('%s', (_name, bustDart) => {

    const s = play(init(), [[20, 1], bustDart as [number, number], MISS])
    const seat = s.seats[0]
    expect(seat.tries).toHaveLength(0)
    expect(seat.left).toBe(61)
    expect(seat.darts).toBe(3)
  })

  it('leaving 1 busts and the visit uses 3 darts', () => {
    const s = play(init(), [[20, 3], MISS, MISS])
    expect(s.seats[0]).toMatchObject({ left: 61, darts: 3 })
  })

  it('a bust visit then a checkout visit counts 3 + the checkout darts', () => {
    const s = play(init(), [[20, 3]], [[19, 3], [2, 2]])
    expect(s.seats[0].tries[0]).toMatchObject({ darts: 5, points: 1 })
  })

  it('a bull finishes on a double', () => {
    // 61 -> T7 (21) -> 40... use 61: T1 (3)=58, then ... easier: 50 left? 61: S11 -> 50, bull
    const s = play(init(), [[11, 1], BULL])
    expect(s.seats[0].tries[0]).toMatchObject({ darts: 2, points: 3, finish: 'Bull' })
  })
})

describe('multiplayer', () => {
  it('every seat plays the same target before the ladder moves on', () => {
    let s = init(2)
    s = play(s, [[19, 3], [2, 2]])
    expect(s.currentPlayer).toBe(1)
    expect(s.seats[1].left).toBe(61)
    s = play(s, miss3)
    expect(s.currentPlayer).toBe(1)
    s = play(s, miss3)
    expect(s.currentPlayer).toBe(0)
    expect(s.seats.map(x => x.tries.length)).toEqual([1, 1])
    expect(s.seats[0].left).toBe(62)
  })

  it('the game ends after target 100 and the highest total wins, a tie shares the place', () => {
    let s = init(2)
    s = { ...s, seats: s.seats.map(seat => ({ ...seat, tries: Array.from({ length: TARGETS - 1 }, (_, i) => ({ target: 61 + i, darts: 6, points: 0, finish: null })), left: 100 })) }
    s = play(s, miss3, miss3, miss3, miss3)
    expect(s.phase).toBe('finished')
    expect(catch40Game.summarize(s, { totalDarts: [12, 12] }).map(r => r.placement)).toEqual([1, 1])

    const t = { ...s, seats: [{ ...s.seats[0], tries: s.seats[0].tries.map((x, i) => (i === 0 ? { ...x, points: 3 } : x)) }, s.seats[1]] }
    expect(totalOf(t.seats[0])).toBe(3)
    const r = catch40Game.summarize(t, { totalDarts: [12, 12] })
    expect(r.map(x => x.placement)).toEqual([1, 2])
    expect(r[0].stats.total).toBe(3)
  })

  it('summarize works on a game nobody finished (a forfeit)', () => {
    const s = play(init(2), [[19, 3], [2, 2]])
    const r = catch40Game.summarize(s, { totalDarts: [2, 0] })
    expect(r.map(x => x.placement)).toEqual([1, 2])
    expect(r[0].stats).toMatchObject({ total: 3, checkouts: 1, targets: 1 })
  })
})

describe('view and replay', () => {
  it('the view carries each seat\'s open target and total', () => {
    const v = catch40Game.view(play(init(2), [[19, 3], [2, 2]]), [{ name: "A" }, { name: "B" }])
    expect(v.seats[0]).toMatchObject({ target: 62, total: 3, done: false })
    expect(v.currentPlayer).toBe(1)
  })

  it('replaying the same events gives the same state', () => {
    const run = () => play(init(2), [[19, 3], [2, 2]], miss3, miss3, [[20, 1], [1, 1], [20, 2]])
    expect(run()).toEqual(run())
  })

  it('is registered with a bull off wrapper and default config', () => {
    expect(catch40Module.defaultConfig.bullOff).toBe('off')
    expect(catch40Module.validate({ bullOff: 'off' } as any)).toBeNull()
  })
})
