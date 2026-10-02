import { describe, it, expect } from 'vitest'
import { rankSeats, forfeitPlacements } from './ranking.js'

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

describe('forfeitPlacements', () => {
  it('puts forfeited seats last, tied, and closes the gaps above them', () => {
    // standings 1,2,3,4; seat 0 (leading) and seat 2 forfeit
    expect(forfeitPlacements([1, 2, 3, 4], new Set([0, 2]))).toEqual([3, 1, 3, 2])
  })
  it('keeps ties among the others', () => {
    expect(forfeitPlacements([1, 1, 3], new Set([2]))).toEqual([1, 1, 3])
    expect(forfeitPlacements([1, 2, 2], new Set([0]))).toEqual([3, 1, 1])
  })
})
