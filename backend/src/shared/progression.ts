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
// Everything a level, a streak milestone or a deed unlocks is cosmetic: on the profile card a title,
// a banner, card colours, a frame round the picture and the name's style; profile pictures (the
// avatar finishes of shared/avatarFinishes.ts); the sound pack your darts make on the match screen;
// and the celebration your wins get. Nothing changes a game, a rating or a queue, and the avatar
// ring is never one (it means online status).

export const PERK_KINDS = ['title', 'banner', 'colors', 'picture', 'frame', 'name', 'sound', 'celebration'] as const
export type PerkKind = (typeof PERK_KINDS)[number]
/** A kind worn through PUT /api/progress/equip; the picture is the avatar, worn through PATCH /api/me. */
export type EquipKind = Exclude<PerkKind, 'picture'>
export const EQUIP_KINDS: readonly EquipKind[] = PERK_KINDS.filter((k): k is EquipKind => k !== 'picture')
/** What unlocks a perk: a level, a day-streak milestone, something done once, or a challenge (its text; nothing unlocks one yet). */
export type Unlock = { level: number } | { streak: number } | { event: 'rankedWins' | 'rankedGold' } | { challenge: string }
/** `animated`: it moves (a sweep, a shimmer, a flicker), which makes it one of the bigger rewards. */
export type Perk = { id: string; kind: PerkKind; name: string; unlock: Unlock; animated?: true }

/**
 * Card colours: a fixed background and foreground pair, picked together (no free colour picker).
 * `effect: 'holo'` lays an animated holographic sheen over the card.
 */
export const CARD_COLORS: Record<string, { bg: string; fg: string; effect?: 'holo' }> = {
  dartcade: { bg: '#181a16', fg: '#c6f24e' },
  'pub-green': { bg: '#1c3324', fg: '#b9e7a5' },
  ice: { bg: '#15262e', fg: '#bfeaf5' },
  ember: { bg: '#33170d', fg: '#ffb27a' },
  midnight: { bg: '#11142a', fg: '#a9b4ff' },
  tungsten: { bg: '#2a2a2c', fg: '#ffd27f' },
  'chalk-dust': { bg: '#e8e6dc', fg: '#2a2e25' },
  sunset: { bg: '#3a1626', fg: '#ffb38a' },
  royal: { bg: '#1f1440', fg: '#d6c2ff' },
  carbon: { bg: '#121212', fg: '#d8d8d8' },
  aurora: { bg: '#0f2a2a', fg: '#7cf2c8' },
  obsidian: { bg: '#0b0b10', fg: '#c9a8ff' },
  holo: { bg: '#1a1d2e', fg: '#e6f0ff', effect: 'holo' },
  'oche-red': { bg: '#3a1a17', fg: '#ffb4ac' },
  'gold-leaf': { bg: '#2b230c', fg: '#f2b94e' },
}

export const PERKS: readonly Perk[] = [
  { id: 'title.rookie', kind: 'title', name: 'Rookie', unlock: { level: 1 } },
  { id: 'title.oche-regular', kind: 'title', name: 'Oche Regular', unlock: { level: 2 } },
  { id: 'title.chalker', kind: 'title', name: 'Chalker', unlock: { level: 6 } },
  { id: 'title.pub-player', kind: 'title', name: 'Pub Player', unlock: { level: 9 } },
  { id: 'title.arrows', kind: 'title', name: 'Arrows', unlock: { level: 11 } },
  { id: 'title.league-night', kind: 'title', name: 'League Night', unlock: { level: 14 } },
  { id: 'title.contender', kind: 'title', name: 'Contender', unlock: { level: 16 } },
  { id: 'title.local-hero', kind: 'title', name: 'Local Hero', unlock: { level: 19 } },
  { id: 'title.steel-tip', kind: 'title', name: 'Steel Tip', unlock: { level: 21 } },
  { id: 'title.challenger', kind: 'title', name: 'Challenger', unlock: { level: 24 } },
  { id: 'title.sharpshooter', kind: 'title', name: 'Sharpshooter', unlock: { level: 26 } },
  { id: 'title.veteran', kind: 'title', name: 'Veteran', unlock: { level: 29 } },
  { id: 'title.crowd-pleaser', kind: 'title', name: 'Crowd Pleaser', unlock: { level: 31 } },
  { id: 'title.headliner', kind: 'title', name: 'Headliner', unlock: { level: 34 } },
  { id: 'title.main-stage', kind: 'title', name: 'Main Stage', unlock: { level: 36 } },
  { id: 'title.oche-royalty', kind: 'title', name: 'Oche Royalty', unlock: { level: 39 } },
  { id: 'title.marquee-name', kind: 'title', name: 'Marquee Name', unlock: { level: 41 } },
  { id: 'title.icon', kind: 'title', name: 'Icon', unlock: { level: 44 } },
  { id: 'title.grand-master', kind: 'title', name: 'Grand Master', unlock: { level: 46 } },
  { id: 'title.almost-legendary', kind: 'title', name: 'Almost Legendary', unlock: { level: 49 } },
  { id: 'title.dartcade-legend', kind: 'title', name: 'Dartcade Legend', unlock: { level: 50 } },
  { id: 'title.fortnight', kind: 'title', name: 'Fortnight', unlock: { streak: 14 } },
  { id: 'title.never-misses', kind: 'title', name: 'Never Misses', unlock: { streak: 100 } },
  { id: 'banner.plain', kind: 'banner', name: 'Plain', unlock: { level: 1 } },
  { id: 'banner.chalk-scribbles', kind: 'banner', name: 'Chalk scribbles', unlock: { level: 4 } },
  { id: 'banner.oche-tape', kind: 'banner', name: 'Oche tape', unlock: { level: 7 } },
  { id: 'banner.cork', kind: 'banner', name: 'Cork board', unlock: { level: 12 } },
  { id: 'banner.neon', kind: 'banner', name: 'Neon sign', unlock: { level: 17 } },
  { id: 'banner.floodlights', kind: 'banner', name: 'Floodlights', unlock: { level: 20 }, animated: true },
  { id: 'banner.scoreboard', kind: 'banner', name: 'Scoreboard', unlock: { level: 22 } },
  { id: 'banner.stage', kind: 'banner', name: 'Stage walk-on', unlock: { level: 27 } },
  { id: 'banner.smoke', kind: 'banner', name: 'Smoke', unlock: { level: 32 } },
  { id: 'banner.arena', kind: 'banner', name: 'Arena lights', unlock: { level: 37 } },
  { id: 'banner.fireworks', kind: 'banner', name: 'Fireworks', unlock: { level: 42 } },
  { id: 'banner.golden-hour', kind: 'banner', name: 'Golden hour', unlock: { level: 47 } },
  { id: 'banner.legend', kind: 'banner', name: 'Legend', unlock: { level: 50 }, animated: true },
  { id: 'banner.gold', kind: 'banner', name: 'Gold', unlock: { streak: 30 } },
  { id: 'colors.dartcade', kind: 'colors', name: 'Dartcade', unlock: { level: 1 } },
  { id: 'colors.pub-green', kind: 'colors', name: 'Pub green', unlock: { level: 5 } },
  { id: 'colors.ice', kind: 'colors', name: 'Ice', unlock: { level: 8 } },
  { id: 'colors.ember', kind: 'colors', name: 'Ember', unlock: { level: 13 } },
  { id: 'colors.midnight', kind: 'colors', name: 'Midnight', unlock: { level: 18 } },
  { id: 'colors.tungsten', kind: 'colors', name: 'Tungsten', unlock: { level: 23 } },
  { id: 'colors.chalk-dust', kind: 'colors', name: 'Chalk dust', unlock: { level: 25 } },
  { id: 'colors.sunset', kind: 'colors', name: 'Sunset', unlock: { level: 28 } },
  { id: 'colors.royal', kind: 'colors', name: 'Royal', unlock: { level: 33 } },
  { id: 'colors.carbon', kind: 'colors', name: 'Carbon', unlock: { level: 38 } },
  { id: 'colors.aurora', kind: 'colors', name: 'Aurora', unlock: { level: 43 } },
  { id: 'colors.obsidian', kind: 'colors', name: 'Obsidian', unlock: { level: 48 } },
  { id: 'colors.holo', kind: 'colors', name: 'Holographic', unlock: { level: 50 }, animated: true },
  { id: 'colors.oche-red', kind: 'colors', name: 'Oche red', unlock: { event: 'rankedGold' } },
  { id: 'colors.gold-leaf', kind: 'colors', name: 'Gold leaf', unlock: { streak: 30 } },
  // Pictures: `picture.<finish>` is the avatar finish of that id (shared/avatarFinishes.ts), on either layer
  { id: 'picture.classic', kind: 'picture', name: 'Classic', unlock: { level: 1 } },
  { id: 'picture.white', kind: 'picture', name: 'White', unlock: { level: 1 } },
  { id: 'picture.red', kind: 'picture', name: 'Red', unlock: { level: 1 } },
  { id: 'picture.sky', kind: 'picture', name: 'Sky', unlock: { level: 1 } },
  { id: 'picture.amber', kind: 'picture', name: 'Amber', unlock: { level: 1 } },
  { id: 'picture.pink', kind: 'picture', name: 'Pink', unlock: { level: 1 } },
  { id: 'picture.violet', kind: 'picture', name: 'Violet', unlock: { level: 1 } },
  { id: 'picture.mint', kind: 'picture', name: 'Mint', unlock: { level: 1 } },
  { id: 'picture.paper', kind: 'picture', name: 'Paper', unlock: { level: 1 } },
  { id: 'picture.chalk', kind: 'picture', name: 'Chalk', unlock: { level: 3 } },
  { id: 'picture.arcade', kind: 'picture', name: 'Arcade', unlock: { level: 5 } },
  { id: 'picture.origami', kind: 'picture', name: 'Origami', unlock: { level: 8 } },
  { id: 'picture.bronze', kind: 'picture', name: 'Bronze', unlock: { level: 10 } },
  { id: 'picture.patch', kind: 'picture', name: 'Patch', unlock: { level: 13 } },
  { id: 'picture.blueprint', kind: 'picture', name: 'Blueprint', unlock: { level: 15 } },
  { id: 'picture.peppermint', kind: 'picture', name: 'Peppermint', unlock: { level: 18 } },
  { id: 'picture.graffiti', kind: 'picture', name: 'Graffiti', unlock: { level: 20 } },
  { id: 'picture.chrome', kind: 'picture', name: 'Chrome', unlock: { level: 25 } },
  { id: 'picture.topo', kind: 'picture', name: 'Topo', unlock: { level: 28 } },
  { id: 'picture.circuit', kind: 'picture', name: 'Circuit', unlock: { level: 30 } },
  { id: 'picture.neon', kind: 'picture', name: 'Neon', unlock: { level: 35 } },
  { id: 'picture.koi', kind: 'picture', name: 'Koi pond', unlock: { level: 38 } },
  { id: 'picture.stained-glass', kind: 'picture', name: 'Stained glass', unlock: { level: 40 } },
  { id: 'picture.inferno', kind: 'picture', name: 'Inferno', unlock: { level: 45 }, animated: true },
  { id: 'picture.synthwave', kind: 'picture', name: 'Synthwave', unlock: { level: 48 } },
  { id: 'picture.gold', kind: 'picture', name: 'Gold', unlock: { level: 50 } },
  { id: 'picture.hot-streak', kind: 'picture', name: 'Hot streak', unlock: { streak: 7 } },
  { id: 'picture.crystal', kind: 'picture', name: 'Crystal', unlock: { event: 'rankedWins' } },
  // Nothing unlocks these yet (there are no achievements), so players don't see them (`obtainable`)
  { id: 'picture.frost', kind: 'picture', name: 'Frost', unlock: { challenge: 'Check out 100+' } },
  { id: 'picture.carbon', kind: 'picture', name: 'Carbon', unlock: { challenge: 'Play 100 games' } },
  { id: 'picture.holo', kind: 'picture', name: 'Holo', unlock: { challenge: 'Season 1 reward' } },
  { id: 'picture.marble', kind: 'picture', name: 'Marble', unlock: { challenge: 'Win 25 ranked games' } },
  { id: 'picture.lava', kind: 'picture', name: 'Lava', unlock: { challenge: 'Win 5 in a row' } },
  { id: 'picture.electric', kind: 'picture', name: 'Electric', unlock: { challenge: 'Throw a 180' } },
  { id: 'picture.galaxy', kind: 'picture', name: 'Galaxy', unlock: { challenge: 'Reach Elite rank' } },
  { id: 'picture.toxic', kind: 'picture', name: 'Toxic', unlock: { challenge: 'Minigolf hole in one' } },
  { id: 'picture.walnut', kind: 'picture', name: 'Walnut', unlock: { challenge: 'Play 20 games with friends' } },
  { id: 'picture.glitch', kind: 'picture', name: 'Glitch', unlock: { challenge: 'Launch week event' } },
  { id: 'frame.none', kind: 'frame', name: 'No frame', unlock: { level: 1 } },
  { id: 'frame.bronze', kind: 'frame', name: 'Bronze', unlock: { level: 10 } },
  { id: 'frame.silver', kind: 'frame', name: 'Silver', unlock: { level: 20 } },
  { id: 'frame.gold', kind: 'frame', name: 'Gold', unlock: { level: 30 } },
  { id: 'frame.platinum', kind: 'frame', name: 'Platinum', unlock: { level: 40 } },
  { id: 'frame.legend', kind: 'frame', name: 'Legend', unlock: { level: 50 }, animated: true },
  { id: 'name.plain', kind: 'name', name: 'Plain', unlock: { level: 1 } },
  { id: 'name.gold', kind: 'name', name: 'Gold name', unlock: { level: 50 }, animated: true },
  { id: 'sound.none', kind: 'sound', name: 'No sounds', unlock: { level: 1 } },
  { id: 'sound.pub', kind: 'sound', name: 'Pub', unlock: { level: 15 } },
  { id: 'sound.arcade', kind: 'sound', name: 'Arcade', unlock: { level: 35 } },
  { id: 'sound.stadium', kind: 'sound', name: 'Stadium', unlock: { level: 45 } },
  { id: 'sound.legend', kind: 'sound', name: 'Legend', unlock: { level: 50 } },
  { id: 'celebration.standard', kind: 'celebration', name: 'Standard', unlock: { level: 1 } },
  { id: 'celebration.confetti', kind: 'celebration', name: 'Confetti', unlock: { level: 30 } },
  { id: 'celebration.fireworks', kind: 'celebration', name: 'Fireworks', unlock: { level: 40 } },
  { id: 'celebration.legend', kind: 'celebration', name: 'Legend', unlock: { level: 50 } },
]

/** Kinds that make a level a big one, as an animated perk does: every fifth level brings one. */
export const BIG_KINDS: ReadonlySet<PerkKind> = new Set(['picture', 'frame', 'name', 'sound', 'celebration'])
export const isBig = (p: Perk): boolean => BIG_KINDS.has(p.kind) || p.animated === true

/** The perk that unlocks avatar finish `finish`. */
export const pictureFor = (finish: string): string => `picture.${finish}`

export const perk = (id: string): Perk | undefined => PERKS.find(p => p.id === id)

/** Whether a player can earn `p`. Nothing unlocks a challenge yet: true again once its unlock is wired. */
export const obtainable = (p: Perk): boolean => !('challenge' in p.unlock)
/** Whether a player sees `p` in the catalogue: one they can earn, or one they hold (`held`: perk ids) anyway. */
export const listed = (p: Perk, held: readonly string[]): boolean => obtainable(p) || held.includes(p.id)

/** What a player wears: one perk id per kind (the picture is their avatar, set apart). */
export type Equipped = Record<EquipKind, string>
/** Everyone's look until they pick: the level 1 perks. */
export const DEFAULT_EQUIPPED: Equipped = {
  title: 'title.rookie',
  banner: 'banner.plain',
  colors: 'colors.dartcade',
  frame: 'frame.none',
  name: 'name.plain',
  sound: 'sound.none',
  celebration: 'celebration.standard',
}

/** The perks level `level` has reached. */
export const levelPerks = (level: number): Perk[] => PERKS.filter(p => 'level' in p.unlock && p.unlock.level <= level)
/** The perks a streak of `days` has reached. */
export const streakPerks = (days: number): Perk[] => PERKS.filter(p => 'streak' in p.unlock && p.unlock.streak <= days)
/** The next perk a level unlocks after `level`. */
export const nextLevelPerk = (level: number): Perk | null =>
  PERKS.filter(p => 'level' in p.unlock && p.unlock.level > level).sort((a, b) => levelOfUnlock(a) - levelOfUnlock(b))[0] ?? null
const levelOfUnlock = (p: Perk): number => ('level' in p.unlock ? p.unlock.level : Infinity)

/** Where a perk comes from, in a few words: 'Level 15', '14-day streak', 'Reach ranked Gold'. */
export function unlockText(u: Unlock): string {
  if ('level' in u) return `Level ${u.level}`
  if ('streak' in u) return `${u.streak}-day streak`
  if ('challenge' in u) return u.challenge
  return { rankedWins: 'Win 10 ranked games', rankedGold: 'Reach ranked Gold' }[u.event]
}

/** A stored look, with every missing, unknown, retired or wrong-kind pick back at its default. */
export function equippedOf(stored: Partial<Record<string, unknown>> | null | undefined): Equipped {
  const pick = (kind: EquipKind): string => {
    const id = stored?.[kind]
    return typeof id === 'string' && perk(id)?.kind === kind ? id : DEFAULT_EQUIPPED[kind]
  }
  return {
    title: pick('title'),
    banner: pick('banner'),
    colors: pick('colors'),
    frame: pick('frame'),
    name: pick('name'),
    sound: pick('sound'),
    celebration: pick('celebration'),
  }
}
