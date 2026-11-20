// The achievement.unlocked push as views (Badge-Unlock board): one per achievement, for the toast
// (the biggest tier is the headline, the rest collapse into a "+N more" chip) and for the screen
// after the game that earned them. Pure; AchievementToasts.svelte and GameAchievements.svelte show them.
import { achievement } from '$shared/achievements.js'
import type { AchievementUnlockedMessage } from '$lib/api/lobby-ws'
import { badgeOf, tierName, type Badge } from './view'

export type Unlock = AchievementUnlockedMessage['unlocked'][number]
export type UnlockView = {
  badge: Badge
  /** Kicker: "New Achievement" for a first tier, "Achievement Tier Up · Gold" after. */
  kicker: string
  tierUp: { from: string; to: string } | null
  /** How far to the next tier; null once maxed or for a one-off. */
  next: { label: string; count: number; target: number; unit: string } | null
  xp: number
}
export type UnlockToast = UnlockView & {
  /** XP of every achievement from the same game. */
  totalXp: number
  /** Further achievements from the same game. */
  more: number
}

function unlockView(u: Unlock): UnlockView | null {
  const def = achievement(u.id)
  if (!def) return null
  const badge = badgeOf(def, { id: u.id, count: u.count, tier: u.tier, earnedAt: null, tierAt: null, isNew: false })
  const target = def.thresholds.at(u.tier)
  return {
    badge,
    kicker: u.from > 0 ? `Achievement Tier Up · ${tierName(u.tier)}` : 'New Achievement',
    tierUp: u.from > 0 ? { from: tierName(u.from), to: tierName(u.tier) } : null,
    next:
      badge.oneOff || target === undefined
        ? null
        : { label: `Next: tier ${u.tier + 1} · ${tierName(u.tier + 1)}`, count: u.count, target, unit: def.unit },
    xp: u.xp,
  }
}

/** What a game unlocked, biggest tier first (the server sends them so; kept here for a client of its own). */
export function unlockViews(m: AchievementUnlockedMessage): UnlockView[] {
  return m.unlocked.flatMap(u => unlockView(u) ?? []).sort((a, b) => b.badge.tier - a.badge.tier)
}

/** What the game `sessionId` unlocked, from the last message: nothing when that was another game's. */
export function gameUnlocks(m: AchievementUnlockedMessage | null, sessionId: string): UnlockView[] {
  return m?.sessionId === sessionId ? unlockViews(m) : []
}

/** The toast for a message; null when none of its achievements is in the catalogue. */
export function toastFor(m: AchievementUnlockedMessage): UnlockToast | null {
  const list = unlockViews(m)
  const head = list.at(0)
  return head ? { ...head, totalXp: list.reduce((a, u) => a + u.xp, 0), more: list.length - 1 } : null
}
