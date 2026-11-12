// A tournament's average limit (Tournament-Create's Average limit): who may join by their X01
// 3-dart average over the last 30 days, and how many legs they must have played in that time.
// Pure, shared with the SPA: the Register button, the register route and the check-in recheck use
// the same rule.

export interface AvgLimit {
  /** Null: no lower bound (at most). */
  readonly min: number | null
  /** Null: no upper bound (at least). */
  readonly max: number | null
  /** Teams: every player within the limit, or the mean of the players' averages. */
  readonly teams: 'every' | 'team'
  /** Legs a player must have played in the 30 days. */
  readonly minLegs: number
  /** On: a spot is kept when the average moves out of range before the start; off: rechecked at check-in. */
  readonly lock: boolean
}

/** A player's last 30 days of X01: the 3-dart average (null without darts) and the legs played. */
export interface Form {
  readonly average: number | null
  readonly legs: number
}

/** The form of a player with no X01 games in the 30 days. */
export const NO_FORM: Form = { average: null, legs: 0 }

export const AVG_LIMIT_RANGE = { min: 0, max: 180, legsMax: 500 } as const

/** few_legs: under minLegs. no_average: no X01 darts. below/above: out of range. */
export type IneligibleReason = 'few_legs' | 'no_average' | 'below' | 'above'

export interface Eligibility {
  readonly eligible: boolean
  readonly reason: IneligibleReason | null
  /** The average checked: the player's, the team's, or the first one out of range. */
  readonly average: number | null
}

const fits = (limit: AvgLimit, average: number | null): Eligibility => {
  const reason: IneligibleReason | null =
    average === null
      ? 'no_average'
      : limit.min !== null && average < limit.min
        ? 'below'
        : limit.max !== null && average > limit.max
          ? 'above'
          : null
  return { eligible: reason === null, reason, average }
}

/** Whether an entry (one player, or a team's picked players, by their forms) may play. */
export function entryEligibility(limit: AvgLimit, forms: readonly Form[]): Eligibility {
  if (forms.some(f => f.legs < limit.minLegs)) return { eligible: false, reason: 'few_legs', average: null }
  const averages = forms.map(f => f.average)
  if (limit.teams === 'team' && averages.length > 1) {
    const known = averages.filter(a => a !== null)
    return fits(limit, known.length === averages.length ? mean(known) : null)
  }
  return averages.map(a => fits(limit, a)).find(e => !e.eligible) ?? fits(limit, averages[0] ?? null)
}

/**
 * What Browse tells one player: alone (solo, or every player checked) their own average; for a team
 * average only their legs, since teammates move the mean.
 */
export function viewerEligibility(limit: AvgLimit, teamSize: number, me: Form): Eligibility {
  if (teamSize > 1 && limit.teams === 'team')
    return me.legs < limit.minLegs
      ? { eligible: false, reason: 'few_legs', average: me.average }
      : { eligible: true, reason: null, average: me.average }
  const e = entryEligibility(limit, [me])
  return { ...e, average: me.average }
}

/** At check-in: an entry keeps its spot unless the limit is unlocked and it no longer fits. */
export const keepsSpot = (limit: AvgLimit | null, e: Eligibility): boolean => limit === null || limit.lock || e.eligible

/** Averages are compared as shown, to one decimal: 45.04 is 45.0, inside "at most 45". */
export const roundAverage = (a: number): number => Math.round(a * 10) / 10

const mean = (xs: readonly number[]): number => roundAverage(xs.reduce((a, b) => a + b, 0) / xs.length)
