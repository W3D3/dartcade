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
