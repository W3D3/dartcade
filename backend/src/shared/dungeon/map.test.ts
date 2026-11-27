import { describe, expect, it } from 'vitest'
import { seededRng } from '../rng.js'
import { generateMap, roomsAbove, tally } from './map.js'
import { DUNGEON_RULES } from './rules.js'

describe('generateMap', () => {
  const maps = Array.from({ length: 200 }, (_, seed) => generateMap(9, seededRng(seed), DUNGEON_RULES))

  it('is the same for the same seed', () => {
    expect(generateMap(9, seededRng(7), DUNGEON_RULES)).toEqual(generateMap(9, seededRng(7), DUNGEON_RULES))
  })

  it('puts floor 1 and the boss alone in the middle lane, a fight below and a rest before the boss', () => {
    for (const { floors } of maps) {
      expect(floors).toHaveLength(9)
      expect(floors[0]).toEqual([{ lane: 2, type: 'fight' }])
      expect(floors[8]).toEqual([{ lane: 2, type: 'boss' }])
      expect(
        floors
          .slice(0, 8)
          .flat()
          .some(r => r.type === 'boss'),
      ).toBe(false)
      expect(floors[7].some(r => r.type === 'rest')).toBe(true)
    }
  })

  it('only leads up: every room is reached from a room one lane over below and leads to one above', () => {
    for (const { floors } of maps) {
      for (let f = 1; f < floors.length; f++) {
        for (const r of floors[f]) expect(floors[f - 1].some(b => Math.abs(b.lane - r.lane) === 1)).toBe(true)
        for (const b of floors[f - 1]) expect(floors[f].some(r => Math.abs(b.lane - r.lane) === 1)).toBe(true)
      }
    }
  })

  it('never has an elite reachable from an elite, no shop, and no elite before floor 3', () => {
    for (const { floors } of maps) {
      for (let f = 1; f < floors.length; f++)
        for (const r of floors[f].filter(r => r.type === 'elite'))
          expect(floors[f - 1].some(b => b.type === 'elite' && Math.abs(b.lane - r.lane) === 1)).toBe(false)
      expect(floors.flat().some(r => r.type === 'shop')).toBe(false)
      expect(
        floors
          .slice(0, 2)
          .flat()
          .some(r => r.type === 'elite'),
      ).toBe(false)
    }
  })

  it('names the ways up from a room by side', () => {
    const map = maps[0]
    expect(roomsAbove(map, 0, null)).toEqual({ left: map.floors[0][0] })
    expect(Object.keys(roomsAbove(map, 1, 2))).toEqual(['left', 'right'])
    const edge = roomsAbove(map, 3, 0)
    expect(Object.keys(edge)).toEqual(['right'])
    expect(edge.right?.lane).toBe(1)
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
