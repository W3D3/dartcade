import { describe, it, expect } from 'vitest'
import { LEVEL_SIGMA, sigmaForLevel } from './levels.js'
import { pickTarget, throwAt } from './accuracy.js'
import { seededRng } from '../session/rng.js'

describe('LEVEL_SIGMA', () => {
  it('has exactly 10 levels, each a positive number', () => {
    expect(LEVEL_SIGMA).toHaveLength(10)
    for (const s of LEVEL_SIGMA) expect(s).toBeGreaterThan(0)
  })

  it('gets tighter (lower sigma) at higher levels', () => {
    for (let i = 1; i < LEVEL_SIGMA.length; i++) expect(LEVEL_SIGMA[i]).toBeLessThanOrEqual(LEVEL_SIGMA[i - 1])
  })

  it('sigmaForLevel rejects an out-of-range level', () => {
    expect(() => sigmaForLevel(0)).toThrow()
    expect(() => sigmaForLevel(11)).toThrow()
  })

  it('Level 1 and Level 10 land within a generous band of their calibration targets', () => {
    const avgOver = (sigma: number, legs: number) => {
      const rng = seededRng(99)
      let darts = 0
      let visits501 = 0
      for (let i = 0; i < legs; i++) {
        let remaining = 501
        let dartsThisVisit = 0
        let scoreAtVisitStart = remaining
        while (remaining > 0) {
          const dartsLeft = 3 - dartsThisVisit
          const target = pickTarget(remaining, dartsLeft, 'double')
          const { segment: seg } = throwAt(target, sigma, rng)
          darts++
          dartsThisVisit++
          const value = seg.name === 'Bull' ? 50 : seg.multiplier * seg.number
          const next = remaining - value
          const bust = next < 0 || next === 1 || (next === 0 && seg.bed !== 'Double')
          remaining = bust ? scoreAtVisitStart : next
          if (bust || dartsThisVisit >= 3 || remaining === 0) {
            dartsThisVisit = 0
            scoreAtVisitStart = remaining
          }
        }
        visits501 += 501
      }
      return (visits501 / darts) * 3
    }
    // Generous ±15 band: this is a sanity check that the table is in the right ballpark,
    // not a precise re-verification of calibrate.ts's own binary search
    expect(avgOver(LEVEL_SIGMA[0], 150)).toBeGreaterThan(15)
    expect(avgOver(LEVEL_SIGMA[0], 150)).toBeLessThan(45)
    expect(avgOver(LEVEL_SIGMA[9], 150)).toBeGreaterThan(85)
  })
})
