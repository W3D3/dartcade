import { describe, expect, it } from 'vitest'
import { fewestChance, minDarts } from './minDarts.js'
import { REF } from './testLegs.js'

describe('minDarts', () => {
  it('counts the fewest darts to check out, double out', () => {
    expect(minDarts(0)).toBe(0)
    for (let n = 2; n <= 40; n += 2) expect(minDarts(n)).toBe(1)
    expect(minDarts(50)).toBe(1)
    expect([41, 99, 100, 159, 169, 170, 171, 180, 211].map(minDarts)).toEqual([2, 3, 2, 4, 4, 3, 4, 4, 4])
    expect([327, 330, 361, 501, 701].map(minDarts)).toEqual([6, 6, 7, 9, 12])
  })
})

describe('fewestChance', () => {
  it('on a checkout in the fewest darts: the chance to check out in that many', () => {
    for (const [left, darts] of [
      [40, 1],
      [100, 2],
      [120, 3],
      [170, 3],
    ])
      expect(fewestChance(REF.landing, left, darts), `${left}`).toBeCloseTo(REF.fin[left][darts], 12)
  })

  it('from 501: the chance of a visit still on a nine-darter, about 4% at level 13', () => {
    expect(fewestChance(REF.landing, 501, 3)).toBeCloseTo(0.0376, 3)
  })
})
