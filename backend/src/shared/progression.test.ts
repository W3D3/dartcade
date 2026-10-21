import { describe, expect, it } from 'vitest'
import {
  type StreakState,
  addDays,
  dailyBonus,
  dailyGameFactor,
  levelCost,
  levelOf,
  localDate,
  nextMilestone,
  startOfLocalDay,
  stepStreak,
  streakNow,
  xpForLevel,
  CARD_COLORS,
  PERKS,
  equippedOf,
  levelPerks,
  nextLevelPerk,
  streakPerks,
  pictureFor,
} from './progression.js'
import { AVATAR_PRESETS } from './avatarPresets.js'

describe('perks', () => {
  // WCAG relative luminance and contrast ratio
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  it('gives every card colour pair readable contrast', () => {
    for (const [id, { bg, fg }] of Object.entries(CARD_COLORS)) expect(contrast(bg, fg), id).toBeGreaterThanOrEqual(4.5)
  })

  it('has a colour pair for every colours perk, and unique ids', () => {
    expect(new Set(PERKS.map(p => p.id)).size).toBe(PERKS.length)
    for (const p of PERKS.filter(x => x.kind === 'colors')) expect(CARD_COLORS[p.id.slice('colors.'.length)], p.id).toBeDefined()
  })

  it('has an avatar preset for every picture but the photo, and a picture for every preset', () => {
    const pictures = PERKS.filter(p => p.kind === 'picture').map(p => p.id)
    expect(AVATAR_PRESETS.map(p => pictureFor(p.id)).sort()).toEqual(pictures.sort())
  })

  it('unlocks by level and streak', () => {
    expect(levelPerks(1).map(p => p.id)).toEqual(['title.rookie', 'banner.plain', 'colors.dartcade', 'picture.logo'])
    expect(levelPerks(15).map(p => p.id)).toContain('title.oche-regular')
    expect(streakPerks(7).map(p => p.id)).toEqual(['picture.flame'])
    expect(nextLevelPerk(14)?.id).toBe('title.oche-regular')
    expect(nextLevelPerk(50)).toBeNull()
  })

  it('reads a stored look, dropping what is unknown or the wrong kind', () => {
    expect(equippedOf(null)).toEqual({ title: 'title.rookie', banner: 'banner.plain', colors: 'colors.dartcade' })
    expect(equippedOf({ title: 'banner.gold', banner: 'banner.gold', colors: 'colors.nope' })).toMatchObject({
      title: 'title.rookie',
      banner: 'banner.gold',
      colors: 'colors.dartcade',
    })
  })
})

describe('dailyBonus', () => {
  it('pays 100, 10 more each streak day, 200 from day 11', () => {
    expect([1, 2, 10, 11, 12, 400].map(dailyBonus)).toEqual([100, 110, 190, 200, 200, 200])
  })
})

describe('stepStreak', () => {
  const fresh: StreakState = { current: 0, best: 0, lastDate: null, freezes: 1 }
  const at = (s: StreakState, ...days: string[]) => days.reduce((st, d) => stepStreak(st, d).next, s)

  it('starts at 1 and grows a day at a time', () => {
    const s = at(fresh, '2026-10-01', '2026-10-02', '2026-10-03')
    expect(s).toEqual({ current: 3, best: 3, lastDate: '2026-10-03', freezes: 1 })
  })

  it('counts the first game of a day only', () => {
    const s = at(fresh, '2026-10-01')
    expect(stepStreak(s, '2026-10-01')).toMatchObject({ counted: false, next: s })
  })

  it('treats an earlier date (the time zone moved west) as the same day', () => {
    const s = at(fresh, '2026-10-01', '2026-10-02')
    expect(stepStreak(s, '2026-10-01')).toMatchObject({ counted: false, next: s })
  })

  it('spends a freeze on one missed day', () => {
    const s = at(fresh, '2026-10-01', '2026-10-02')
    expect(stepStreak(s, '2026-10-04')).toEqual({
      next: { current: 3, best: 3, lastDate: '2026-10-04', freezes: 0 },
      counted: true,
      frozeDay: '2026-10-03',
      milestone: null,
    })
  })

  it('resets after one missed day without a freeze, or two missed days', () => {
    const noFreeze = at({ ...fresh, freezes: 0 }, '2026-10-01', '2026-10-02')
    expect(stepStreak(noFreeze, '2026-10-04').next).toMatchObject({ current: 1, best: 2 })
    const s = at(fresh, '2026-10-01', '2026-10-02')
    expect(stepStreak(s, '2026-10-05').next).toMatchObject({ current: 1, best: 2, freezes: 1 })
  })

  it('earns a freeze every 7 days, two at most, and pays milestones', () => {
    const days = Array.from({ length: 14 }, (_, i) => addDays('2026-10-01', i))
    const six = at(fresh, ...days.slice(0, 6))
    const seventh = stepStreak(six, days[6])
    expect(seventh.next.freezes).toBe(2)
    expect(seventh.milestone).toEqual({ days: 7, xp: 250 })
    expect(at(fresh, ...days).freezes).toBe(2)
    expect(nextMilestone(7)).toEqual({ days: 14, xp: 300 })
  })

  it('crosses months and years', () => {
    expect(at(fresh, '2026-12-31', '2027-01-01').current).toBe(2)
  })
})

describe('streakNow', () => {
  const s: StreakState = { current: 5, best: 5, lastDate: '2026-10-10', freezes: 1 }
  it('stays alive through yesterday, or the day before with a freeze', () => {
    expect(streakNow(s, '2026-10-10')).toBe(5)
    expect(streakNow(s, '2026-10-11')).toBe(5)
    expect(streakNow(s, '2026-10-12')).toBe(5)
    expect(streakNow({ ...s, freezes: 0 }, '2026-10-12')).toBe(0)
    expect(streakNow(s, '2026-10-13')).toBe(0)
  })
})

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

describe('startOfLocalDay', () => {
  it('finds local midnight, across summer and winter time', () => {
    expect(startOfLocalDay('2026-10-22', 'Europe/Vienna').toISOString()).toBe('2026-10-21T22:00:00.000Z')
    expect(startOfLocalDay('2026-10-26', 'Europe/Vienna').toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(startOfLocalDay('2026-10-22', 'America/New_York').toISOString()).toBe('2026-10-22T04:00:00.000Z')
    expect(startOfLocalDay('2026-10-22', null).toISOString()).toBe('2026-10-22T00:00:00.000Z')
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
