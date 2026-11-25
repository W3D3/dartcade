import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS } from '$shared/achievements.js'
import {
  modeNote,
  badgeOf,
  badgesOf,
  byCategory,
  compare,
  filterBadges,
  progressLine,
  statusLine,
  summarize,
  unlockLine,
  type AchievementTier,
} from './view'

const def = ACHIEVEMENTS.find(a => a.id === 'x01.180')!
const row = (count: number, tier: number) => ({
  id: def.id,
  count,
  tier,
  tiers: Array.from({ length: tier }, (_, i) => ({
    tier: i + 1,
    reachedAt: '2026-11-03T10:00:00Z',
    where: null,
    gameId: null,
    gone: false,
  })),
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
    expect(byCategory(badges).map(g => g.category)).toEqual(['countdown'])
  })
  it('compares two players', () => {
    const theirs = badgesOf({ achievements: [row(30, 4)], showcase: [], unseen: 0 })
    expect(compare(badges, theirs)).toEqual({ both: 1, ahead: [def.name], behind: [] })
  })
})

describe('modeNote', () => {
  it('names the modes of an achievement that narrows its category', () => {
    expect(modeNote(def)).toBe('X01 only')
    expect(modeNote(ACHIEVEMENTS.find(a => a.id === 'x01.bullseye')!)).toBeNull()
  })
})

describe('unlockLine', () => {
  const T20 = { number: 20, multiplier: 3 }
  const tier = (over: Partial<AchievementTier>): AchievementTier => ({
    tier: 3,
    reachedAt: '2026-11-12T20:00:00Z',
    where: { visit: 17, leg: 1, legVisit: 5, darts: [T20, T20, T20], dart: null },
    gameId: 'g1',
    gone: false,
    ...over,
  })
  it('names the tier, the day, the leg and visit with its darts, and links to that visit', () => {
    expect(unlockLine(tier({}), false)).toEqual({
      when: 'Gold · 12 Nov',
      where: 'Leg 2, visit 5 · T20 T20 T20',
      href: '#/stats/history/g1?visit=17',
      gone: false,
    })
  })
  it('names only the dart that counted, the bull as Board Manager reports it', () => {
    const where = { visit: 3, leg: null, legVisit: 2, darts: [T20, { number: 25, multiplier: 2 }], dart: 1 }
    expect(unlockLine(tier({ where }), true)).toMatchObject({ when: null, where: 'Visit 2 · Bull' })
  })
  it('has no link where the viewer may not open the game, or it is gone', () => {
    expect(unlockLine(tier({ gameId: null }), false)).toMatchObject({ where: 'Leg 2, visit 5 · T20 T20 T20', href: null, gone: false })
    expect(unlockLine(tier({ gameId: null, gone: true }), false)).toMatchObject({ href: null, gone: true })
  })
  it('has only the day for an unlock from before visits were kept', () => {
    expect(unlockLine(tier({ where: null, gameId: null }), false)).toEqual({ when: 'Gold · 12 Nov', where: null, href: null, gone: false })
  })
})
