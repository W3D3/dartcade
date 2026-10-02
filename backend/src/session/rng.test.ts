import { describe, it, expect } from 'vitest'
import { seededRng, newSeed, shuffle } from './rng.js'

describe('seededRng', () => {
  it('gives the same numbers for the same seed', () => {
    const a = seededRng(42), b = seededRng(42)
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
  })

  it('stays in [0, 1) and differs between seeds', () => {
    const r = seededRng(7)
    for (let i = 0; i < 1000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(seededRng(1)()).not.toBe(seededRng(2)())
  })

  it('newSeed is a non-negative 31-bit integer', () => {
    const s = newSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 31)
  })
})

describe('shuffle', () => {
  it('is a permutation, the same for the same seed', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f']
    const once = shuffle(xs, seededRng(9))
    expect(shuffle(xs, seededRng(9))).toEqual(once)
    expect([...once].sort()).toEqual(xs)
    expect(xs).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])   // the input is left alone
  })
})
