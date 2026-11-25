// What one finished game adds to each achievement's count. Pure: it reads the same ChallengeGame
// the challenges do (progression/facts.ts), so typed-in darts count for neither. Which modes count
// for an achievement is shared/achievements.ts (`modesOf`); a counter only says how.
import type { ChallengeGame, Checkout, Seg, Visit } from '../progression/challenges.js'
import type { components } from '../schema/api.js'
import { visitTier } from '../shared/darts.js'
import { achievement, modesOf } from '../shared/achievements.js'

/** Where a count went up: the visit that did it, and the dart when one dart did. */
export type AchievementSource = NonNullable<components['schemas']['AchievementTier']['where']>
type Hit = { visit: number; dart: number | null }

const isBull = (s: Seg) => s.n === 25 && s.m === 2
const isDouble = (s: Seg) => s.m === 2

const visits = (g: ChallengeGame, keep: (v: Visit) => boolean): Hit[] => g.visits.filter(keep).map(v => ({ visit: v.visit, dart: null }))
const checkouts = (g: ChallengeGame, keep: (c: Checkout) => boolean): Hit[] =>
  g.checkouts.filter(keep).map(c => ({ visit: c.visit, dart: c.dart }))

const counters: Record<string, (g: ChallengeGame) => Hit[]> = {
  'x01.180': g => visits(g, v => !v.bust && visitTier(v.scored ?? 0) === 'max'),
  'x01.bigFish': g => checkouts(g, c => c.value === 170),
  'x01.tonPlus': g => visits(g, v => !v.bust && visitTier(v.scored ?? 0) !== null),
  'x01.tonPlusOut': g => checkouts(g, c => c.value >= 100),
  'x01.bedAndBreakfast': g => visits(g, v => !v.bust && v.scored === 26),
  'x01.bullseye': g => g.visits.flatMap(v => v.segs.flatMap((s, dart) => (isBull(s) ? [{ visit: v.visit, dart }] : []))),
  'x01.bullFinish': g => checkouts(g, c => isBull(c.last)),
  'x01.doubleTheDoubles': g => checkouts(g, c => isDouble(c.last) && c.prev !== undefined && isDouble(c.prev)),
  'x01.madhouse': g => checkouts(g, c => c.last.n === 1 && isDouble(c.last)),
}

/** A hit as stored with the tier it reaches: the visit's leg (X01 only), the player's visit number in it and its darts. */
function sourceOf(g: ChallengeGame, hit: Hit): AchievementSource {
  const v = g.visits.find(x => x.visit === hit.visit)
  const leg = v?.leg ?? 0
  return {
    visit: hit.visit,
    leg: g.mode === 'x01' ? leg : null,
    legVisit: g.visits.filter(x => x.leg === leg && x.visit <= hit.visit).length,
    darts: v?.segs.map(s => ({ number: s.n, multiplier: s.m })) ?? [],
    dart: hit.dart,
  }
}

/**
 * The achievement ids this game moved, each with one source per count it adds, in the order thrown.
 * Nothing for a game that doesn't qualify.
 */
export function achievementHits(g: ChallengeGame): Map<string, AchievementSource[]> {
  const hits = new Map<string, AchievementSource[]>()
  if (!g.qualifies) return hits
  for (const [id, count] of Object.entries(counters)) {
    const def = achievement(id)
    if (!def || !modesOf(def).includes(g.mode)) continue
    const found = count(g)
    if (found.length > 0)
      hits.set(
        id,
        found.map(h => sourceOf(g, h)),
      )
  }
  return hits
}

/** The push promises the biggest tier first (the headline badge of the toast); ties keep the catalogue order. */
export function biggestTierFirst<T extends { tier: number }>(unlocked: T[]): T[] {
  return [...unlocked].sort((a, b) => b.tier - a.tier)
}
