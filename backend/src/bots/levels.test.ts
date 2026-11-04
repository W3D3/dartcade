import { describe, it, expect } from 'vitest'
import { LEVEL_SIGMA, sigmaForLevel } from './levels.js'
import { LEVEL_AVERAGE } from '../shared/botLevels.js'
import { simulatedAverage } from './simulatedAverage.js'

describe('LEVEL_SIGMA', () => {
  it('has exactly 20 levels, each a positive number', () => {
    expect(LEVEL_SIGMA).toHaveLength(20)
    for (const s of LEVEL_SIGMA) expect(s).toBeGreaterThan(0)
  })

  it('gets tighter (lower sigma) at higher levels', () => {
    for (let i = 1; i < LEVEL_SIGMA.length; i++) expect(LEVEL_SIGMA[i]).toBeLessThan(LEVEL_SIGMA[i - 1])
  })

  it('sigmaForLevel rejects an out-of-range level', () => {
    expect(() => sigmaForLevel(0)).toThrow()
    expect(() => sigmaForLevel(21)).toThrow()
  })

  it('every level lands within 10% of its calibration target', () => {
    // Few legs per level, so the band is wider than calibrate.ts's own search needs
    LEVEL_AVERAGE.forEach((target, i) => {
      const avg = simulatedAverage(LEVEL_SIGMA[i], 200)
      expect(Math.abs(avg - target) / target, `level ${i + 1}: ${avg.toFixed(1)} vs ${target}`).toBeLessThan(0.1)
    })
  }, 120_000)
})
