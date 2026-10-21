import { describe, expect, it } from 'vitest'
import { dailyGameFactor, levelCost, levelOf, localDate, xpForLevel } from './progression.js'

describe('level curve', () => {
  it('costs 200 + 40 per level, capped at 2,400 from level 55', () => {
    expect(levelCost(1)).toBe(240)
    expect(levelCost(54)).toBe(2360)
    expect(levelCost(55)).toBe(2400)
    expect(levelCost(90)).toBe(2400)
  })

  it('totals match the summed costs', () => {
    let total = 0
    for (let l = 1; l < 80; l++) {
      expect(xpForLevel(l)).toBe(total)
      total += levelCost(l)
    }
    expect(xpForLevel(15)).toBe(7000)
    expect(xpForLevel(50)).toBe(58_800)
  })

  it('finds the level and the XP to go', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, cost: 240, toGo: 240 })
    expect(levelOf(239).level).toBe(1)
    expect(levelOf(240).level).toBe(2)
    expect(levelOf(6780)).toMatchObject({ level: 14, toGo: 220 })
    for (const l of [2, 10, 54, 55, 56, 120]) {
      expect(levelOf(xpForLevel(l))).toMatchObject({ level: l, into: 0 })
      expect(levelOf(xpForLevel(l) - 1).level).toBe(l - 1)
    }
  })
})

describe('daily factor', () => {
  it('pays games 1-8 in full, 9-16 half, then a tenth', () => {
    expect([1, 8, 9, 16, 17, 40].map(dailyGameFactor)).toEqual([1, 1, 0.5, 0.5, 0.1, 0.1])
  })
})

describe('localDate', () => {
  const at = new Date('2026-10-21T22:30:00Z')
  it('takes the day in the time zone', () => {
    expect(localDate(at, 'Europe/Vienna')).toBe('2026-10-22')
    expect(localDate(at, 'America/New_York')).toBe('2026-10-21')
  })
  it('falls back to UTC for an unknown zone', () => {
    expect(localDate(at, 'Mars/Olympus')).toBe('2026-10-21')
    expect(localDate(at, null)).toBe('2026-10-21')
  })
})
