import { describe, expect, it } from 'vitest'
import { minDarts } from './minDarts.js'

describe('minDarts', () => {
  it('counts the fewest darts to check out, double out', () => {
    expect(minDarts(0)).toBe(0)
    for (let n = 2; n <= 40; n += 2) expect(minDarts(n)).toBe(1)
    expect(minDarts(50)).toBe(1)
    expect([41, 99, 100, 159, 169, 170, 171, 180, 211].map(minDarts)).toEqual([2, 3, 2, 4, 4, 3, 4, 4, 4])
    expect([327, 330, 361, 501, 701].map(minDarts)).toEqual([6, 6, 7, 9, 12])
  })
})
