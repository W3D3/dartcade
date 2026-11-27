import { describe, expect, it } from 'vitest'
import { clockwise, hitOf, onSpot, opposite, sideOf } from './hit.js'

describe('hits and board geometry', () => {
  it('reads the board segment', () => {
    expect(hitOf({ number: 20, multiplier: 3, bed: 'Triple' })).toEqual({ number: 20, ring: 'treble', score: 60 })
    expect(hitOf({ number: 25, multiplier: 1, bed: 'Single' })).toEqual({ number: 25, ring: 'bull', score: 25 })
    expect(hitOf({ number: 50, multiplier: 1, bed: 'Double' })).toEqual({ number: 25, ring: 'bullseye', score: 50 })
    expect(hitOf({ number: 25, multiplier: 2, bed: 'Double' })).toEqual({ number: 25, ring: 'bullseye', score: 50 })
    expect(hitOf({ number: 7, multiplier: 0, bed: 'Outside' }).ring).toBe('miss')
  })

  it('splits the board into halves, with 20, 3 and the bull on neither', () => {
    expect(sideOf(hitOf({ number: 11, multiplier: 1, bed: 'Single' }))).toBe('left')
    expect(sideOf(hitOf({ number: 6, multiplier: 2, bed: 'Double' }))).toBe('right')
    for (const n of [20, 3, 25]) expect(sideOf({ number: n, ring: 'single', score: n })).toBeNull()
  })

  it('knows the opposite and the clockwise neighbour', () => {
    expect([opposite(20), opposite(1), clockwise(20), clockwise(5), opposite(25)]).toEqual([3, 19, 1, 20, null])
  })

  it('a bull spot covers both bulls', () => {
    expect(onSpot({ number: 25, ring: 'bullseye', score: 50 }, { ring: 'bull' })).toBe(true)
    expect(onSpot({ number: 0, ring: 'miss', score: 0 }, { number: 0 })).toBe(false)
  })
})
