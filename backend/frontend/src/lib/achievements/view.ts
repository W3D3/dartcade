// What the Achievements screens show about one badge or about a player's collection. Pure: the
// catalogue is shared (shared/achievements.ts), the counts come from GET /api/achievements.
import { ACHIEVEMENTS, TIER_NAMES, type AchievementCategory, type AchievementDef } from '$shared/achievements.js'
import type { components } from '$lib/api/schema'

export type Achievements = components['schemas']['Achievements']
export type AchievementRow = Achievements['achievements'][number]

export const CATEGORY_NAME: Record<AchievementCategory, string> = { x01: 'X01', minigolf: 'Minigolf', social: 'Social' }
const CATEGORIES: AchievementCategory[] = ['x01', 'minigolf', 'social']

export type Badge = {
  def: AchievementDef
  /** 0 = not earned. */
  tier: number
  count: number
  /** One-off: a single threshold, so no tiers or count. */
  oneOff: boolean
  /** The count of the next tier, null at the top (or for a one-off once earned). */
  next: number | null
  /** 0..1 towards the next tier (towards the first one while not earned). */
  fraction: number
  earnedAt: string | null
}

export function badgeOf(def: AchievementDef, row: AchievementRow | undefined): Badge {
  const count = row?.count ?? 0
  const tier = row?.tier ?? 0
  const next = def.thresholds.at(tier) ?? null
  const from = tier === 0 ? 0 : def.thresholds[tier - 1]
  return {
    def,
    tier,
    count,
    oneOff: def.thresholds.length === 1,
    next,
    fraction: next === null ? 1 : Math.min(1, Math.max(0, (count - from) / (next - from))),
    earnedAt: row?.tierAt ?? null,
  }
}

/** Every catalogue badge for a player, in catalogue order. */
export function badgesOf(data: Achievements): Badge[] {
  const rows = new Map(data.achievements.map(r => [r.id, r]))
  return ACHIEVEMENTS.map(def => badgeOf(def, rows.get(def.id)))
}

export const tierName = (tier: number): string => TIER_NAMES[tier - 1] ?? ''

/** "Tier 3 · Gold", "Not earned yet", "Earned 3 Nov" for a one-off. */
export function statusLine(b: Badge): string {
  if (b.tier === 0) return 'Not earned yet'
  if (b.oneOff) return b.earnedAt ? `Earned ${shortDate(b.earnedAt)}` : 'Earned'
  return `Tier ${b.tier} · ${tierName(b.tier)}`
}

/** "14 / 20 to Platinum", "0 / 1 to unlock"; null once maxed or for an earned one-off. */
export function progressLine(b: Badge): string | null {
  if (b.next === null) return null
  const to = b.tier === 0 ? 'unlock' : tierName(b.tier + 1)
  return `${fmt(b.count)} / ${fmt(b.next)} to ${to}`
}

export const shortDate = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const fmt = (n: number): string => n.toLocaleString('en-GB').replace(/,/g, ' ')

export type Filter = 'all' | 'earned' | 'notYet'
export const filterBadges = (badges: Badge[], f: Filter): Badge[] =>
  f === 'all' ? badges : badges.filter(b => (f === 'earned') === b.tier > 0)

export type Summary = { earned: number; total: number; tiers: number; possible: number; highest: number; latest: Badge | null }
export function summarize(badges: Badge[]): Summary {
  const earned = badges.filter(b => b.tier > 0)
  const latest = earned.reduce<Badge | null>((a, b) => (a === null || (b.earnedAt ?? '') > (a.earnedAt ?? '') ? b : a), null)
  return {
    earned: earned.length,
    total: badges.length,
    tiers: badges.reduce((a, b) => a + b.tier, 0),
    possible: badges.reduce((a, b) => a + b.def.thresholds.length, 0),
    highest: Math.max(0, ...earned.map(b => b.tier)),
    latest,
  }
}

/** The badges of a category, for the page's sections; empty categories left out. */
export function byCategory(badges: Badge[]): { category: AchievementCategory; badges: Badge[] }[] {
  return CATEGORIES.map(category => ({ category, badges: badges.filter(b => b.def.category === category) })).filter(
    g => g.badges.length > 0,
  )
}

/** Profile compare line: how many both hold, and who leads where. */
export function compare(mine: Badge[], theirs: Badge[]): { both: number; ahead: string[]; behind: string[] } {
  const their = new Map(theirs.map(b => [b.def.id, b]))
  const ahead: string[] = []
  const behind: string[] = []
  let both = 0
  for (const m of mine) {
    const t = their.get(m.def.id)
    if (!t) continue
    if (m.tier > 0 && t.tier > 0) both++
    if (t.tier > m.tier) ahead.push(m.def.name)
    else if (m.tier > t.tier) behind.push(m.def.name)
  }
  return { both, ahead, behind }
}
