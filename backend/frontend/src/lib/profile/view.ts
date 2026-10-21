// Formatting for the Profile page (Profile-Self, Profile-Phone boards).
import type { components } from '$lib/api/schema'
import type { GameStats } from '$lib/api'

type Relation = components['schemas']['ProfileRelation']

/** The X01 tile under "Averages": 3-dart average with its trend, first 9, checkout %, 180s, best leg. */
export type X01Averages = {
  average: string | null
  trend: { text: string; up: boolean } | null
  first9: string | null
  checkoutPct: string | null
  count180: number | null
  bestLeg: number | null
}

type StatAggregate = GameStats['modes'][string]['stats'][string]
const statOf = (stats: Record<string, StatAggregate>, key: string): StatAggregate | undefined =>
  Object.hasOwn(stats, key) ? stats[key] : undefined

export function x01Averages(stats: GameStats | null): X01Averages | null {
  const m = stats?.modes.x01
  if (!m) return null
  const avg = statOf(m.stats, 'average')
  const first9 = statOf(m.stats, 'first9Average')
  const hits = statOf(m.stats, 'checkoutHits')
  const attempts = statOf(m.stats, 'checkoutAttempts')
  const count180 = statOf(m.stats, 'count180')
  const bestLeg = statOf(m.stats, 'bestLegDarts')
  const trend =
    avg && avg.previousAvg !== null
      ? { text: `${Math.abs(avg.avg - avg.previousAvg).toFixed(1)} vs last month`, up: avg.avg >= avg.previousAvg }
      : null
  return {
    average: avg ? avg.avg.toFixed(1) : null,
    trend,
    first9: first9 ? first9.avg.toFixed(1) : null,
    checkoutPct: attempts && attempts.sum > 0 ? `${Math.round(((hits?.sum ?? 0) / attempts.sum) * 100)}%` : null,
    count180: count180 ? count180.sum : null,
    bestLeg: bestLeg ? bestLeg.min : null,
  }
}

/** "Add friend" and the like; each row says the button(s) to show for a relation. */
export function relationLabel(relation: Relation): string {
  switch (relation.kind) {
    case 'self':
      return 'You'
    case 'friend':
      return 'Friend'
    case 'incoming':
      return 'Wants to be friends'
    case 'outgoing':
      return 'Request sent'
    case 'none':
      return ''
  }
}
