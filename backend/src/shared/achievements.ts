// Achievements: the catalogue (data) and how a count becomes a tier. Shared by the backend, which
// counts them when a game ends (achievements/), and the frontend, which draws the badges.
// The Achievements, Badges and Badge-Unlock artboards of the design canvas are the spec.

/** Tier names, 1 to 5: the rim climbs from dark to the Dartcade finish. */
export const TIER_NAMES = ['Dark', 'Silver', 'Gold', 'Platinum', 'Dartcade'] as const
export const MAX_TIER = TIER_NAMES.length
/** XP a tier pays when reached (tier 1 first). One table for every achievement. */
export const TIER_XP = [100, 150, 300, 500, 1000] as const
/** The most achievements a player shows on their profile. */
export const SHOWCASE_SIZE = 5

export type AchievementCategory = 'countdown' | 'minigolf' | 'social'

/**
 * Each category's heading and the game modes whose games count towards it. The one place to list a
 * mode: adding a countdown game is one entry here (an achievement can still narrow it with `modes`).
 */
export const CATEGORIES: Record<AchievementCategory, { name: string; modes: readonly string[] }> = {
  countdown: { name: 'Countdown', modes: ['x01', 'p121'] },
  minigolf: { name: 'Minigolf', modes: ['minigolf'] },
  social: { name: 'Social', modes: [] },
}

export type AchievementDef = {
  id: string
  name: string
  description: string
  category: AchievementCategory
  /** Counts that reach tier 1..5, rising. A one-off has a single entry. */
  thresholds: readonly number[]
  /** What the count counts, for the progress line ("180s"). */
  unit: string
  /** Only these game modes count, where the category's are too many (a 180 needs X01's visit scores). */
  modes?: readonly string[]
}

const five = (n: [number, number, number, number, number]) => n

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'x01.180',
    name: 'ONE HUNDRED AND EIGHTYYY',
    description: 'Throw a 180 in any X01 game.',
    category: 'countdown',
    thresholds: five([1, 5, 10, 20, 100]),
    unit: '180s',
    modes: ['x01'],
  },
  {
    id: 'x01.bigFish',
    name: 'Big Fish',
    description: 'Check out 170: T20 · T20 · Bull.',
    category: 'countdown',
    thresholds: five([1, 3, 5, 10, 25]),
    unit: '170 checkouts',
  },
  {
    id: 'x01.tonPlus',
    name: 'TON PLUS',
    description: 'Score 100 or more in one visit.',
    category: 'countdown',
    thresholds: five([10, 100, 500, 1000, 5000]),
    unit: 'visits of 100+',
    modes: ['x01'],
  },
  {
    id: 'x01.tonPlusOut',
    name: 'TON PLUS OUT',
    description: 'Check out on 100 or more.',
    category: 'countdown',
    thresholds: five([1, 10, 25, 50, 100]),
    unit: '100+ checkouts',
  },
  {
    id: 'x01.bedAndBreakfast',
    name: 'Bed & Breakfast',
    description: 'Score exactly 26 in a visit. The classic S20 · S5 · S1.',
    category: 'countdown',
    thresholds: five([26, 52, 104, 260, 520]),
    unit: 'visits of 26',
    modes: ['x01'],
  },
  {
    id: 'x01.bullseye',
    name: 'Bullseye',
    description: 'Hit the bullseye (inner bull, 50) with any dart.',
    category: 'countdown',
    thresholds: five([10, 50, 100, 250, 1000]),
    unit: 'bullseyes',
  },
  {
    id: 'x01.bullFinish',
    name: 'Bull Finish',
    description: 'Check out on the bullseye.',
    category: 'countdown',
    thresholds: five([1, 5, 10, 25, 50]),
    unit: 'checkouts on the bull',
  },
  {
    id: 'x01.doubleTheDoubles',
    name: 'Double the Doubles',
    description: 'Check out with the last two darts both on a double, like D16 · D20.',
    category: 'countdown',
    thresholds: five([1, 5, 10, 25, 50]),
    unit: 'two-double checkouts',
  },
  {
    id: 'x01.madhouse',
    name: 'Madhouse',
    description: 'Win a leg on D1, the double nobody wants.',
    category: 'countdown',
    thresholds: five([1, 3, 5, 10, 25]),
    unit: 'legs finished on D1',
  },
]

const BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]))
export const achievement = (id: string): AchievementDef | undefined => BY_ID.get(id)

/** The tier `count` reaches (0 = not earned). */
export function tierOf(def: Pick<AchievementDef, 'thresholds'>, count: number): number {
  return def.thresholds.filter(t => count >= t).length
}

/** The XP for reaching tiers `from + 1` to `to`. */
export function xpForTiers(from: number, to: number): number {
  return TIER_XP.slice(from, to).reduce((a, b) => a + b, 0)
}

/** The game modes whose games count for `def`. */
export const modesOf = (def: AchievementDef): readonly string[] => def.modes ?? CATEGORIES[def.category].modes

/** Whether a finished game of `mode` can move any achievement. */
export const countsFor = (mode: string): boolean => ACHIEVEMENTS.some(a => modesOf(a).includes(mode))
