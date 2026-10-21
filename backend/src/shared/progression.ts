// Progression: XP, levels and the local day they are counted in. Shared by the backend, which pays
// XP when a game ends (progression/rules.ts), and the frontend, which shows levels and bars.
// Level measures effort, rank (shared/ranked.ts) measures skill: neither feeds the other.

/** What a finished game pays. Every number of the XP table lives here. */
export const XP = {
  /** Per board-detected dart, from the final dart list. */
  dart: 1,
  /** Dart XP a day, at most. */
  dartDailyCap: 500,
  /** Finishing a game you threw at least `minDarts` in. */
  game: 50,
  minDarts: 9,
  /** Winning against at least one human on another account; against bots only it is `winBot`. */
  winHuman: 100,
  winBot: 25,
  /** Playing a ranked match, and winning it on top. */
  ranked: 25,
  rankedWin: 50,
  /** Highlights: a 180, a checkout of `checkoutMin` or more, a new personal best in a mode. */
  oneEighty: 25,
  checkout: 15,
  checkoutMin: 100,
  personalBest: 50,
} as const

/** Games of a day pay in full, then half, then a tenth (game and win XP; ranked bonuses don't shrink). */
export function dailyGameFactor(gameOfDay: number): number {
  if (gameOfDay <= 8) return 1
  if (gameOfDay <= 16) return 0.5
  return 0.1
}

/** Games entered by hand or without a bridge: no dart XP, half game XP, this many a day (ranked games are exempt). */
export const MANUAL_GAMES_PER_DAY = 4
export const MANUAL_GAME_FACTOR = 0.5

/** The XP from level `level` to the next: 200 + 40 per level, capped at 2,400 (from level 55). */
export function levelCost(level: number): number {
  return Math.min(200 + 40 * level, LEVEL_COST_CAP)
}
const LEVEL_COST_CAP = 2400
const CAP_LEVEL = 55

/** Total XP to reach `level` (level 1 is 0 XP): (L-1)(200+20L) below the cap. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= CAP_LEVEL) return (level - 1) * (200 + 20 * level)
  return xpForLevel(CAP_LEVEL) + (level - CAP_LEVEL) * LEVEL_COST_CAP
}

export type LevelProgress = {
  level: number
  /** XP earned since the level started. */
  into: number
  /** XP the level takes in all. */
  cost: number
  /** XP still to go to the next level. */
  toGo: number
}

/** The level `xp` total XP reaches, and how far into it. There is no level cap. */
export function levelOf(xp: number): LevelProgress {
  const total = Math.max(0, Math.floor(xp))
  let level = 1
  if (total >= xpForLevel(CAP_LEVEL)) level = CAP_LEVEL + Math.floor((total - xpForLevel(CAP_LEVEL)) / LEVEL_COST_CAP)
  else while (xpForLevel(level + 1) <= total) level++
  const into = total - xpForLevel(level)
  const cost = levelCost(level)
  return { level, into, cost, toGo: cost - into }
}

/** Day of `at` in the IANA time zone `timeZone` (UTC when unknown), as YYYY-MM-DD. */
export function localDate(at: Date, timeZone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: validTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    at,
  )
}

/** `timeZone` when the runtime knows it, else UTC. */
export function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

// ---- Daily bonus and day streak -------------------------------------------------------------
// The first qualifying game of a local day pays the daily bonus and extends the day streak.

/** The bonus for the first game of streak day `day` (1 = the first): 100, +10 a day, at most 200 (day 11). */
export function dailyBonus(day: number): number {
  return Math.min(100 + 10 * Math.max(0, day - 1), 200)
}

/** Freezes banked at most; a new account starts with one and earns one every 7 streak days. */
export const MAX_FREEZES = 2
export const FREEZE_EVERY = 7

export type Milestone = { days: number; xp: number }
/** Streak lengths that pay a one-off gift (some unlock a cosmetic too: PERKS). */
export const MILESTONES: readonly Milestone[] = [
  { days: 7, xp: 250 },
  { days: 14, xp: 300 },
  { days: 30, xp: 400 },
  { days: 60, xp: 500 },
  { days: 100, xp: 750 },
  { days: 365, xp: 1000 },
]

export const nextMilestone = (streak: number): Milestone | null => MILESTONES.find(m => m.days > streak) ?? null

const DAY_MS = 86_400_000
/** Days from `from` to `to` (YYYY-MM-DD each): 1 for the next day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}
/** `date` moved by `days` (YYYY-MM-DD). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export type StreakState = { current: number; best: number; lastDate: string | null; freezes: number }

/** What a qualifying game on `today` does to the streak. */
export type StreakStep = {
  next: StreakState
  /** The day's first qualifying game: it pays the bonus. False when today already counted. */
  counted: boolean
  /** The missed day a freeze covered. */
  frozeDay: string | null
  /** A milestone reached today. */
  milestone: Milestone | null
}

/**
 * Plays a qualifying game on `today` into the streak. Missing exactly one day spends a banked
 * freeze; missing more (or one without a freeze) starts over at 1. A date before the last one (the
 * time zone moved west) counts as the same day.
 */
export function stepStreak(s: StreakState, today: string): StreakStep {
  const gap = s.lastDate === null ? null : daysBetween(s.lastDate, today)
  if (gap !== null && gap <= 0) return { next: s, counted: false, frozeDay: null, milestone: null }
  let current = 1
  let freezes = s.freezes
  let frozeDay: string | null = null
  if (gap === 1) current = s.current + 1
  else if (gap === 2 && freezes > 0 && s.current > 0) {
    freezes -= 1
    frozeDay = addDays(today, -1)
    current = s.current + 1
  }
  if (current % FREEZE_EVERY === 0) freezes = Math.min(MAX_FREEZES, freezes + 1)
  return {
    next: { current, best: Math.max(s.best, current), lastDate: today, freezes },
    counted: true,
    frozeDay,
    milestone: MILESTONES.find(m => m.days === current) ?? null,
  }
}

/** The streak as it stands on `today`: alive while yesterday counted, or the day before with a freeze to cover it. */
export function streakNow(s: StreakState, today: string): number {
  if (s.lastDate === null) return 0
  const gap = daysBetween(s.lastDate, today)
  if (gap <= 1) return s.current
  if (gap === 2 && s.freezes > 0) return s.current
  return 0
}
