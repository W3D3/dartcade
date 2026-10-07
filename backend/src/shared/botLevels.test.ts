import { describe, it, expect } from 'vitest'
import { LEVEL_AVERAGE, averageForLevel } from './botLevels.js'

describe('LEVEL_AVERAGE', () => {
  it('has exactly 10 levels, each a positive number, strictly increasing', () => {
    expect(LEVEL_AVERAGE).toHaveLength(10)
    for (let i = 0; i < LEVEL_AVERAGE.length; i++) {
      expect(LEVEL_AVERAGE[i]).toBeGreaterThan(0)
      if (i > 0) expect(LEVEL_AVERAGE[i]).toBeGreaterThan(LEVEL_AVERAGE[i - 1])
    }
  })

  it('averageForLevel matches the array (1-indexed)', () => {
    expect(averageForLevel(1)).toBe(LEVEL_AVERAGE[0])
    expect(averageForLevel(10)).toBe(LEVEL_AVERAGE[9])
  })

  it('rejects an out-of-range level', () => {
    expect(() => averageForLevel(0)).toThrow()
    expect(() => averageForLevel(11)).toThrow()
  })
})
