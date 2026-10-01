import { describe, it, expect } from 'vitest'
import { rankSeats } from './ranking.js'

const byScoreAsc = (scores: number[]) => (a: number, b: number) => scores[a] - scores[b]

describe('rankSeats', () => {
  it('puts the winner first and ranks the rest from 2nd', () => {
    expect(rankSeats(3, 1, byScoreAsc([40, 0, 100]))).toEqual([2, 1, 3])
  })
  it('lets equal seats share a placement', () => {
    expect(rankSeats(4, 1, byScoreAsc([50, 0, 50, 70]))).toEqual([2, 1, 2, 4])
  })
  it('keeps the winner first even when the order would rank someone above them', () => {
    expect(rankSeats(2, 1, byScoreAsc([0, 100]))).toEqual([2, 1])
  })
  it('a solo game is 1st', () => {
    expect(rankSeats(1, 0, () => 0)).toEqual([1])
  })
  it('without a winner ranks everyone from 1st', () => {
    expect(rankSeats(2, null, byScoreAsc([10, 5]))).toEqual([2, 1])
  })
})
