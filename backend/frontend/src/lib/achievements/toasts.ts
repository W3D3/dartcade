// The achievement.unlocked push as toasts (Badge-Unlock board): the biggest tier is the headline,
// the rest collapse into a "+N more" chip. Pure; AchievementToasts.svelte shows them.
import { achievement } from '$shared/achievements.js'
import type { AchievementUnlockedMessage } from '$lib/api/lobby-ws'
import { badgeOf, tierName, type Badge } from './view'

export type Unlock = AchievementUnlockedMessage['unlocked'][number]
export type UnlockToast = {
  badge: Badge
  /** Kicker: "New Achievement" for a first tier, "Achievement Tier Up · Gold" after. */
  kicker: string
  tierUp: { from: string; to: string; next: string | null; count: number; target: number | null } | null
  xp: number
  /** Further achievements from the same game. */
  more: number
}

/** The toast for a message; null when none of its achievements is in the catalogue. */
export function toastFor(m: AchievementUnlockedMessage): UnlockToast | null {
  const list = m.unlocked.flatMap(u => {
    const def = achievement(u.id)
    return def ? [{ ...u, def }] : []
  })
  // Biggest tier first (the server sends them so; kept here for a client of its own)
  const head = list.reduce<(typeof list)[number] | undefined>((a, u) => (a === undefined || u.tier > a.tier ? u : a), undefined)
  if (head === undefined) return null
  const badge = badgeOf(head.def, { id: head.id, count: head.count, tier: head.tier, earnedAt: null, tierAt: null, isNew: false })
  return {
    badge,
    kicker: head.tierUp ? `Achievement Tier Up · ${tierName(head.tier)}` : 'New Achievement',
    tierUp: head.tierUp
      ? {
          from: tierName(head.tier - 1),
          to: tierName(head.tier),
          next: head.tier >= head.def.thresholds.length ? null : `Next: tier ${head.tier + 1} · ${tierName(head.tier + 1)}`,
          count: head.count,
          target: head.def.thresholds.at(head.tier) ?? null,
        }
      : null,
    xp: list.reduce((a, u) => a + u.xp, 0),
    more: list.length - 1,
  }
}
