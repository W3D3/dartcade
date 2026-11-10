import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS } from '$shared/achievements.js'
import { badgeOf, badgesOf, byCategory, compare, filterBadges, progressLine, statusLine, summarize } from './view'

const def = ACHIEVEMENTS.find(a => a.id === 'x01.180')!
const row = (count: number, tier: number) => ({
  id: def.id,
  count,
  tier,
  earnedAt: '2026-11-03T10:00:00Z',
  tierAt: '2026-11-03T10:00:00Z',
  isNew: false,
})

describe('badgeOf', () => {
  it('measures progress inside the current tier', () => {
    const b = badgeOf(def, row(14, 3))
    expect(b).toMatchObject({ tier: 3, next: 20, count: 14 })
    expect(b.fraction).toBeCloseTo(0.4)
    expect(statusLine(b)).toBe('Tier 3 · Gold')
    expect(progressLine(b)).toBe('14 / 20 to Platinum')
  })
  it('counts towards tier 1 while not earned', () => {
    const b = badgeOf(def, undefined)
    expect(b).toMatchObject({ tier: 0, next: 1, fraction: 0 })
    expect(statusLine(b)).toBe('Not earned yet')
    expect(progressLine(b)).toBe('0 / 1 to unlock')
  })
  it('has nothing left at the top tier', () => {
    const b = badgeOf(def, row(120, 5))
    expect(b).toMatchObject({ next: null, fraction: 1 })
    expect(progressLine(b)).toBeNull()
  })
})

describe('collection', () => {
  const data = { achievements: [row(14, 3)], showcase: [], unseen: 0 }
  const badges = badgesOf(data)
  it('lists the whole catalogue, filtered and summarised', () => {
    expect(badges).toHaveLength(ACHIEVEMENTS.length)
    expect(filterBadges(badges, 'earned').map(b => b.def.id)).toEqual(['x01.180'])
    expect(filterBadges(badges, 'notYet')).toHaveLength(ACHIEVEMENTS.length - 1)
    expect(summarize(badges)).toMatchObject({ earned: 1, tiers: 3, highest: 3, latest: { def: { id: 'x01.180' } } })
    expect(byCategory(badges).map(g => g.category)).toEqual(['x01'])
  })
  it('compares two players', () => {
    const theirs = badgesOf({ achievements: [row(30, 4)], showcase: [], unseen: 0 })
    expect(compare(badges, theirs)).toEqual({ both: 1, ahead: [def.name], behind: [] })
  })
})
