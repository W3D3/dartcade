import { describe, it, expect } from 'vitest'
import { LEVEL_AVERAGE, LEVEL_SIGMA, averageForLevel, botLevelLabel, sigmaForAverage } from './botLevels.js'

describe('LEVEL_AVERAGE', () => {
  it('has 20 levels, level n averaging 15 + 5n', () => {
    expect(LEVEL_AVERAGE).toHaveLength(20)
    LEVEL_AVERAGE.forEach((a, i) => expect(a).toBe(15 + 5 * (i + 1)))
  })

  it('averageForLevel matches the array (1-indexed)', () => {
    expect(averageForLevel(1)).toBe(LEVEL_AVERAGE[0])
    expect(averageForLevel(20)).toBe(LEVEL_AVERAGE[19])
  })

  it('rejects an out-of-range level', () => {
    expect(() => averageForLevel(0)).toThrow()
    expect(() => averageForLevel(21)).toThrow()
  })
})

describe('botLevelLabel', () => {
  it("X01: the calibrated average, since that's what the average means there", () => {
    expect(botLevelLabel(4, 'x01')).toBe('35 avg')
  })
  it('every other game, and no game: just the level', () => {
    expect(botLevelLabel(4, 'cricket')).toBe('Level 4')
    expect(botLevelLabel(4, undefined)).toBe('Level 4')
  })
})

describe('sigmaForAverage', () => {
  it('is the level sigma at a level average', () => {
    for (const [i, a] of LEVEL_AVERAGE.entries()) expect(sigmaForAverage(a)).toBeCloseTo(LEVEL_SIGMA[i], 10)
  })
  it('lies between the sigmas of the levels around an average, and falls as the average rises', () => {
    const between = sigmaForAverage(52.5)
    expect(between).toBeLessThan(LEVEL_SIGMA[6])
    expect(between).toBeGreaterThan(LEVEL_SIGMA[7])
    for (let a = 21; a <= 115; a++) expect(sigmaForAverage(a)).toBeLessThan(sigmaForAverage(a - 1))
  })
  it('clamps below the first and above the last level', () => {
    expect(sigmaForAverage(10)).toBe(LEVEL_SIGMA[0])
    expect(sigmaForAverage(130)).toBe(LEVEL_SIGMA[19])
  })
})
