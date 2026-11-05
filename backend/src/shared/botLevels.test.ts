import { describe, it, expect } from 'vitest'
import { LEVEL_AVERAGE, averageForLevel, botLevelLabel } from './botLevels.js'

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
