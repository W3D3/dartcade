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

/** The instant local day `date` (YYYY-MM-DD) starts in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string | null | undefined): Date {
  const zone = validTimeZone(timeZone)
  const utc = Date.parse(`${date}T00:00:00Z`)
  // The zone's offset at a moment: its wall clock read as UTC, minus the moment
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
        .formatToParts(new Date(t))
        .map(x => [x.type, Number(x.value)]),
    )
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000
  }
  // Twice: the offset at midnight can differ from the one a few hours off (a DST change)
  return new Date(utc - offset(utc - offset(utc)))
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

// ---- Cosmetics -------------------------------------------------------------------------------
// Everything a level, a streak milestone or a deed unlocks is cosmetic: a title, a banner, card
// colours and an emblem on the profile card. Nothing changes a game, a rating or a queue, and the
// avatar ring is never one (it means online status).

export type PerkKind = 'title' | 'banner' | 'colors' | 'emblem'
/** What unlocks a perk: a level, a day-streak milestone, or something done once. */
export type Unlock = { level: number } | { streak: number } | { event: 'oneEighty' | 'atc' | 'rankedWins' | 'rankedGold' }
export type Perk = { id: string; kind: PerkKind; name: string; unlock: Unlock }

/** Card colours: a fixed background and foreground pair, picked together (no free colour picker). */
export const CARD_COLORS: Record<string, { bg: string; fg: string }> = {
  dartcade: { bg: '#181a16', fg: '#c6f24e' },
  chalk: { bg: '#26301d', fg: '#e9f5c8' },
  treble: { bg: '#1e3a2b', fg: '#f2dca0' },
  'oche-red': { bg: '#3a1a17', fg: '#ffb4ac' },
  night: { bg: '#14202e', fg: '#9ec8ff' },
  'gold-leaf': { bg: '#2b230c', fg: '#f2b94e' },
  paper: { bg: '#e9dfc4', fg: '#1a1a17' },
  bullseye: { bg: '#4a1f1c', fg: '#ffd9d5' },
}

export const PERKS: readonly Perk[] = [
  { id: 'title.rookie', kind: 'title', name: 'Rookie', unlock: { level: 1 } },
  { id: 'title.oche-regular', kind: 'title', name: 'Oche Regular', unlock: { level: 15 } },
  { id: 'title.finisher', kind: 'title', name: 'Finisher', unlock: { level: 35 } },
  { id: 'title.maximum', kind: 'title', name: 'Maximum', unlock: { level: 40 } },
  { id: 'title.fortnight', kind: 'title', name: 'Fortnight', unlock: { streak: 14 } },
  { id: 'title.never-misses', kind: 'title', name: 'Never Misses', unlock: { streak: 100 } },
  { id: 'banner.plain', kind: 'banner', name: 'Plain', unlock: { level: 1 } },
  { id: 'banner.chalk', kind: 'banner', name: 'Chalkboard', unlock: { level: 10 } },
  { id: 'banner.treble', kind: 'banner', name: 'Treble ring', unlock: { level: 25 } },
  { id: 'banner.bullseye', kind: 'banner', name: 'Bullseye', unlock: { level: 50 } },
  { id: 'banner.gold', kind: 'banner', name: 'Gold', unlock: { streak: 30 } },
  { id: 'colors.dartcade', kind: 'colors', name: 'Dartcade', unlock: { level: 1 } },
  { id: 'colors.night', kind: 'colors', name: 'Night', unlock: { level: 5 } },
  { id: 'colors.chalk', kind: 'colors', name: 'Chalk', unlock: { level: 10 } },
  { id: 'colors.treble', kind: 'colors', name: 'Treble', unlock: { level: 25 } },
  { id: 'colors.paper', kind: 'colors', name: 'Paper', unlock: { level: 35 } },
  { id: 'colors.bullseye', kind: 'colors', name: 'Bullseye', unlock: { level: 50 } },
  { id: 'colors.oche-red', kind: 'colors', name: 'Oche red', unlock: { event: 'rankedGold' } },
  { id: 'colors.gold-leaf', kind: 'colors', name: 'Gold leaf', unlock: { streak: 30 } },
  { id: 'emblem.dart', kind: 'emblem', name: 'Dart', unlock: { level: 1 } },
  { id: 'emblem.target', kind: 'emblem', name: 'Target', unlock: { level: 20 } },
  { id: 'emblem.star', kind: 'emblem', name: 'Star', unlock: { level: 30 } },
  { id: 'emblem.crown', kind: 'emblem', name: 'Crown', unlock: { level: 40 } },
  { id: 'emblem.flame', kind: 'emblem', name: 'Flame', unlock: { streak: 7 } },
  { id: 'emblem.180', kind: 'emblem', name: '180 sign', unlock: { event: 'oneEighty' } },
  { id: 'emblem.shield', kind: 'emblem', name: 'Shield', unlock: { event: 'rankedWins' } },
  { id: 'emblem.clock', kind: 'emblem', name: 'Clock', unlock: { event: 'atc' } },
]

export const perk = (id: string): Perk | undefined => PERKS.find(p => p.id === id)

/** What a player wears: one perk id per kind; no emblem until one is picked. */
export type Equipped = { title: string; banner: string; colors: string; emblem: string | null }
/** Everyone's look until they pick: the level 1 perks. */
export const DEFAULT_EQUIPPED: Equipped = { title: 'title.rookie', banner: 'banner.plain', colors: 'colors.dartcade', emblem: null }

/** The perks level `level` has reached. */
export const levelPerks = (level: number): Perk[] => PERKS.filter(p => 'level' in p.unlock && p.unlock.level <= level)
/** The perks a streak of `days` has reached. */
export const streakPerks = (days: number): Perk[] => PERKS.filter(p => 'streak' in p.unlock && p.unlock.streak <= days)
/** The next perk a level unlocks after `level`. */
export const nextLevelPerk = (level: number): Perk | null =>
  PERKS.filter(p => 'level' in p.unlock && p.unlock.level > level).sort((a, b) => levelOfUnlock(a) - levelOfUnlock(b))[0] ?? null
const levelOfUnlock = (p: Perk): number => ('level' in p.unlock ? p.unlock.level : Infinity)

/** Where a perk comes from, in a few words: 'Level 15', '14-day streak', 'Hit a 180'. */
export function unlockText(u: Unlock): string {
  if ('level' in u) return `Level ${u.level}`
  if ('streak' in u) return `${u.streak}-day streak`
  return { oneEighty: 'Hit a 180', atc: 'Finish Around the Clock', rankedWins: 'Win 10 ranked games', rankedGold: 'Reach ranked Gold' }[
    u.event
  ]
}

/** A stored look, with every missing, unknown or wrong-kind pick back at its default. */
export function equippedOf(stored: Partial<Record<string, unknown>> | null | undefined): Equipped {
  const pick = (kind: PerkKind): string | null => {
    const id = stored?.[kind]
    return typeof id === 'string' && perk(id)?.kind === kind ? id : null
  }
  return {
    title: pick('title') ?? DEFAULT_EQUIPPED.title,
    banner: pick('banner') ?? DEFAULT_EQUIPPED.banner,
    colors: pick('colors') ?? DEFAULT_EQUIPPED.colors,
    emblem: pick('emblem'),
  }
}
