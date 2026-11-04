// The levels the coach grades a player at: each has its own landing table (landing/<id>.gen.ts),
// made by `npm run gen:coach` at the aiming spread of its average. The player picks one
// (the coachTarget preference) or leaves it on auto: the suggested tier for their average.

export const COACH_TIERS = [
  { id: 'beginner', name: 'Beginner', average: 30, as: 'a beginner' },
  { id: 'pub', name: 'Pub player', average: 45, as: 'a pub player' },
  { id: 'intermediate', name: 'Intermediate', average: 60, as: 'an intermediate' },
  { id: 'semipro', name: 'Semi-pro', average: 75, as: 'a semi-pro' },
  { id: 'pro', name: 'Pro', average: 90, as: 'a pro' },
  { id: 'worldclass', name: 'World class', average: 105, as: 'a world-class player' },
] as const

export type CoachTier = (typeof COACH_TIERS)[number]
export type CoachTierId = CoachTier['id']
/** The account preference: a tier, or auto (suggestedTier of the player's average) */
export type CoachTarget = 'auto' | CoachTierId

export const COACH_TIER_IDS = COACH_TIERS.map(t => t.id)
/** Without an average the coach grades as an intermediate */
export const DEFAULT_TIER: CoachTierId = 'intermediate'
/** Brilliant is measured against this tier's table, the same for every player (grade.ts BRILLIANT_CHANCE) */
export const BRILLIANT_TIER: CoachTierId = 'semipro'

export const tierOf = (id: CoachTierId): CoachTier => COACH_TIERS.find(t => t.id === id) ?? COACH_TIERS[2]

/** The tier a player with this average is coached as: the one they reached exactly, else the next
 *  one above (a 52 average aims for 60); world class above 105; intermediate without an average. */
export function suggestedTier(average: number | null | undefined): CoachTierId {
  if (average == null || !Number.isFinite(average)) return DEFAULT_TIER
  return (COACH_TIERS.find(t => t.average >= average) ?? COACH_TIERS[COACH_TIERS.length - 1]).id
}

/** The tier the coach grades with: the player's pick, or the suggestion on auto (or an unknown value). */
export function targetTier(target: string | null | undefined, average: number | null | undefined): CoachTierId {
  return COACH_TIERS.find(t => t.id === target)?.id ?? suggestedTier(average)
}

/** "Graded as a pro (90 average)" */
export const gradedAs = (id: CoachTierId): string => `Graded as ${tierOf(id).as} (${tierOf(id).average} average)`
