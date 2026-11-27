import { describe, expect, it } from 'vitest'
import { seededRng } from '../rng.js'
import { generateMap, tally } from './map.js'
import { DUNGEON_RULES } from './rules.js'

describe('generateMap', () => {
  const maps = Array.from({ length: 200 }, (_, seed) => generateMap(9, seededRng(seed), DUNGEON_RULES))

  it('is the same for the same seed', () => {
    expect(generateMap(9, seededRng(7), DUNGEON_RULES)).toEqual(generateMap(9, seededRng(7), DUNGEON_RULES))
  })

  it('puts the boss alone on the last floor and nowhere else, fights on floor 1, a rest before the boss', () => {
    for (const { floors } of maps) {
      expect(floors).toHaveLength(9)
      expect(floors[8]).toEqual([{ side: 'left', type: 'boss' }])
      expect(
        floors
          .slice(0, 8)
          .flat()
          .some(r => r.type === 'boss'),
      ).toBe(false)
      expect(floors[0].every(r => r.type === 'fight')).toBe(true)
      expect(floors[7].some(r => r.type === 'rest')).toBe(true)
    }
  })

  it('offers a left and a right room below the boss, never two elites or shops on consecutive floors, no shop', () => {
    for (const { floors } of maps) {
      for (let f = 0; f < 8; f++) {
        expect(floors[f].map(r => r.side)).toEqual(['left', 'right'])
        const here = floors[f].map(r => r.type)
        const next = floors[f + 1]?.map(r => r.type) ?? []
        expect(here.includes('elite') && next.includes('elite')).toBe(false)
        expect(here).not.toContain('shop')
      }
      expect(
        floors
          .slice(0, 2)
          .flat()
          .some(r => r.type === 'elite'),
      ).toBe(false)
    }
  })

  it('fits shorter acts', () => {
    const { floors } = generateMap(5, seededRng(1), DUNGEON_RULES)
    expect(floors).toHaveLength(5)
    expect(floors[4][0].type).toBe('boss')
  })
})

describe('tally', () => {
  it('takes the majority', () => {
    expect(tally(['left', 'right', 'right'], seededRng(1))).toBe('right')
  })

  it('breaks a tie with the seeded generator', () => {
    const results = Array.from({ length: 40 }, (_, seed) => tally(['left', 'right'], seededRng(seed)))
    expect(new Set(results)).toEqual(new Set(['left', 'right']))
    expect(results).toEqual(Array.from({ length: 40 }, (_, seed) => tally(['left', 'right'], seededRng(seed))))
  })
})
