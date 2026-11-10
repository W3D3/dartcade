import { describe, it, expect } from 'vitest'
import type { Seg, Visit } from '../progression/challenges.js'
import { p121Checkouts } from './countdown.js'

const S = (n: number, m = 1): Seg => ({ n, m })
const visit = (...segs: Seg[]): Visit => ({ leg: 0, segs, scored: null, bust: false })

describe('p121Checkouts', () => {
  it('reads the finishing darts of each made try from the seat’s visits', () => {
    // try 1 (121): T20 · S11 · S10 then S1 ... missed in 4 darts; try 2 (122): T20 · T20 · D1 made in the visit's last darts
    const visits = [visit(S(20, 3), S(11), S(10)), visit(S(1), S(0, 0), S(0, 0)), visit(S(20, 3), S(20, 3), S(1, 2))]
    const out = p121Checkouts(visits, [
      { target: 121, made: false, darts: 6 },
      { target: 122, made: true, darts: 3 },
    ])
    expect(out).toEqual([{ last: S(1, 2), prev: S(20, 3), value: 122, darts: 3, startScore: 122 }])
  })
  it('has no second dart to show when the checkout is a visit’s only dart', () => {
    const out = p121Checkouts([visit(S(20, 3), S(20, 3), S(1)), visit(S(25, 2))], [{ target: 61, made: true, darts: 4 }])
    expect(out).toEqual([{ last: S(25, 2), value: 50, darts: 4, startScore: 61 }])
  })
  it('values a checkout by what the finishing visit scored, not by the try’s target', () => {
    // 121 made as 60 · 41 · D10 over two visits: the finishing visit (T10 · S11 · D10) scored 61
    const visits = [visit(S(20, 3), S(0, 0), S(0, 0)), visit(S(10, 3), S(11), S(10, 2))]
    const out = p121Checkouts(visits, [{ target: 121, made: true, darts: 6 }])
    expect(out).toEqual([{ last: S(10, 2), prev: S(11), value: 61, darts: 6, startScore: 121 }])
  })
  it('skips made tries when the seat has no darts (typed in)', () => {
    expect(p121Checkouts([], [{ target: 121, made: true, darts: 3 }])).toEqual([])
  })
})
