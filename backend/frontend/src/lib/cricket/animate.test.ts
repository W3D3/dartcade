import { describe, it, expect } from 'vitest'
import { markDeltas } from './animate.js'

const marks = (a: number[], b: number[]) => ({ marks: [a, b], legs: [0, 0] })
const zero = [0, 0, 0, 0, 0, 0, 0]

describe('markDeltas', () => {
  it('gives the marks a dart started from, for the cell it raised only', () => {
    const prev = marks([0, 0, 1, 0, 0, 0, 0], zero)
    const next = marks([0, 0, 2, 0, 0, 0, 0], zero)
    expect(markDeltas(prev, next)).toEqual([[0, 0, 1, 0, 0, 0, 0], zero])
  })

  it('animates nothing on the first snapshot', () => {
    const next = marks([3, 0, 2, 0, 0, 0, 0], zero)
    expect(markDeltas(null, next)).toEqual(next.marks)
  })

  it('animates nothing when a new leg starts', () => {
    const prev = marks([3, 3, 3, 3, 3, 3, 2], zero)
    const next = { marks: [[1, 0, 0, 0, 0, 0, 0], zero], legs: [1, 0] }
    expect(markDeltas(prev, next)).toEqual(next.marks)
  })

  it('animates nothing after an undo or a correction that lowers marks', () => {
    const prev = marks([0, 3, 0, 0, 0, 0, 0], zero)
    // T19 corrected to T18
    const next = marks([0, 0, 3, 0, 0, 0, 0], zero)
    expect(markDeltas(prev, next)).toEqual(next.marks)
    expect(markDeltas(prev, marks([0, 2, 0, 0, 0, 0, 0], zero))).toEqual([[0, 2, 0, 0, 0, 0, 0], zero])
  })

  it('animates nothing when several targets went up at once (a reconnect)', () => {
    const prev = marks(zero, zero)
    const next = marks([1, 0, 2, 0, 0, 0, 0], zero)
    expect(markDeltas(prev, next)).toEqual(next.marks)
  })

  it("animates every seat of a team when the team's marks go up", () => {
    const prev = { marks: [[0, 0, 0, 0, 0, 0, 1], zero, [0, 0, 0, 0, 0, 0, 1]], legs: [0, 0, 0] }
    const next = { marks: [[0, 0, 0, 0, 0, 0, 3], zero, [0, 0, 0, 0, 0, 0, 3]], legs: [0, 0, 0] }
    expect(markDeltas(prev, next)).toEqual(prev.marks)
  })
})
