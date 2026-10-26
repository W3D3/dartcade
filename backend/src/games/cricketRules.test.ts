import { describe, it, expect } from 'vitest'
import { applyMarks, cricketTarget, emptyMarks, legWinner, marksFor, TARGETS, type Marks } from './cricketRules.js'
import type { Dart } from '../session/types.js'

const d = (number: number, multiplier: number): Dart =>
  ({ segment: { name: '', number, bed: 'Single', multiplier }, score: number * multiplier }) as Dart
const idx = (n: number) => TARGETS.indexOf(n)
/** A board from per-team rows of marks in TARGETS order, plus points. */
const board = (rows: number[][], points: number[]): Marks => ({ targets: TARGETS, marks: rows.map(r => [...r]), points: [...points] })
const ALL = [3, 3, 3, 3, 3, 3, 3]
const NONE = [0, 0, 0, 0, 0, 0, 0]

describe('marksFor', () => {
  it.each([
    [20, 3, 20, 3],
    [15, 2, 15, 2],
    [17, 1, 17, 1],
    [25, 1, 25, 1],
    [25, 2, 25, 2],
    [50, 1, 25, 2],
    [50, 0, 25, 2],
  ])('%i×%i → %i, %i marks', (n, m, target, marks) => {
    expect(marksFor(d(n, m), TARGETS)).toEqual({ target: idx(target), marks })
  })
  it('a miss or a number outside the targets gives nothing', () => {
    expect(marksFor(d(0, 0), TARGETS)).toBeNull()
    expect(marksFor(d(14, 3), TARGETS)).toBeNull()
  })
})

describe('applyMarks', () => {
  it('opens before it scores', () => {
    const r = applyMarks(emptyMarks(2), 0, idx(20), 3, 'standard')
    expect(r.board.marks[0][idx(20)]).toBe(3)
    expect(r).toMatchObject({ counted: 3, scored: 0 })
    const r2 = applyMarks(r.board, 0, idx(20), 3, 'standard')
    expect(r2.board.points).toEqual([60, 0])
    expect(r2).toMatchObject({ counted: 3, scored: 60 })
  })
  it('splits a dart between opening and scoring', () => {
    const b = board([[2, 0, 0, 0, 0, 0, 0], NONE], [0, 0])
    const r = applyMarks(b, 0, idx(20), 3, 'standard')
    expect(r.board.marks[0][idx(20)]).toBe(3)
    expect(r.board.points).toEqual([40, 0])
    expect(r.counted).toBe(3)
  })
  it('scores nothing on a closed target', () => {
    const b = board(
      [
        [3, 0, 0, 0, 0, 0, 0],
        [3, 0, 0, 0, 0, 0, 0],
      ],
      [0, 0],
    )
    const r = applyMarks(b, 0, idx(20), 3, 'standard')
    expect(r.board.points).toEqual([0, 0])
    expect(r).toMatchObject({ counted: 0, scored: 0 })
  })
  it('standard, 3 players: scores while any opponent is still open', () => {
    const b = board([[3, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0], NONE], [0, 0, 0])
    expect(applyMarks(b, 0, idx(20), 1, 'standard').board.points).toEqual([20, 0, 0])
  })
  it('cut-throat gives the points to every opponent still open', () => {
    const b = board([[3, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0], NONE], [0, 0, 0])
    const r = applyMarks(b, 0, idx(20), 3, 'cutthroat')
    expect(r.board.points).toEqual([0, 0, 60])
    expect(r.scored).toBe(60)
  })
  it('the bull scores 25 a mark', () => {
    const b = board([[0, 0, 0, 0, 0, 0, 3], NONE], [0, 0])
    expect(applyMarks(b, 0, idx(25), 2, 'standard').board.points).toEqual([50, 0])
  })
  it('does not mutate its input', () => {
    const b = emptyMarks(2)
    applyMarks(b, 0, idx(20), 3, 'standard')
    expect(b).toEqual(emptyMarks(2))
  })
})

describe('legWinner', () => {
  it('needs every target opened and not behind', () => {
    expect(legWinner(board([ALL, NONE], [0, 0]), 0, 'standard')).toBe(0)
    expect(legWinner(board([ALL, NONE], [0, 20]), 0, 'standard')).toBeNull()
    expect(legWinner(board([[3, 3, 3, 3, 3, 3, 2], NONE], [100, 0]), 0, 'standard')).toBeNull()
  })
  it('a tie on points is enough', () => {
    expect(legWinner(board([ALL, NONE], [40, 40]), 0, 'standard')).toBe(0)
  })
  it('cut-throat wants the fewest points', () => {
    expect(legWinner(board([ALL, NONE], [0, 20]), 0, 'cutthroat')).toBe(0)
    expect(legWinner(board([ALL, NONE], [20, 0]), 0, 'cutthroat')).toBeNull()
  })
  it('cut-throat: the thrower can hand the leg to someone else', () => {
    // A throws and pushes B to 60; C opened everything with 50 and is now lowest
    expect(legWinner(board([NONE, NONE, ALL], [60, 60, 50]), 0, 'cutthroat')).toBe(2)
  })
  it('the thrower is checked first', () => {
    expect(legWinner(board([ALL, ALL], [0, 0]), 1, 'standard')).toBe(1)
  })
})

describe('cricketTarget', () => {
  const rows = (a: number[], b: number[]) => [a, b]
  it.each([
    ['fresh: the highest target', rows(NONE, NONE), [0, 0], 'standard', 'T20'],
    ['behind with a scoring target: score', rows([3, 0, 0, 0, 0, 0, 0], NONE), [0, 40], 'standard', 'T20'],
    ['ahead: defend what they opened', rows([3, 0, 0, 0, 0, 0, 0], [0, 0, 3, 0, 0, 0, 0]), [40, 0], 'standard', 'T18'],
    ['ahead, nothing to defend: close the next', rows([3, 3, 0, 0, 0, 0, 0], NONE), [40, 0], 'standard', 'T18'],
    ['the bull last', rows([3, 3, 3, 3, 3, 3, 0], ALL), [0, 0], 'standard', 'Bull'],
    ['cut-throat: close what can hurt me first', rows([3, 0, 0, 0, 0, 0, 0], [0, 3, 0, 0, 0, 0, 0]), [0, 0], 'cutthroat', 'T19'],
    ['cut-throat: then pile on', rows([3, 0, 0, 0, 0, 0, 0], NONE), [0, 0], 'cutthroat', 'T20'],
  ] as const)('%s', (_, marks, points, mode, want) => {
    expect(
      cricketTarget(
        board(
          marks.map(r => [...r]),
          [...points],
        ),
        0,
        mode,
      ),
    ).toBe(want)
  })
})
