// Guest teammates (Tournament-Register-Guest): a team may be filled up with players who have no
// account. They play on the captain's board, need no confirmation, and count as a fixed average
// for the average limit. Pure, shared with the SPA.
import { roundAverage, type AvgLimit, type Form } from './avgLimit.js'

export interface GuestRules {
  /** Guests one team may field; null: any number (a team keeps at least one player with an account). */
  readonly perTeam: 1 | null
  /** The 3-dart average a guest counts as against the average limit. */
  readonly average: number
}

export const GUEST_AVERAGE_RANGE = { min: 0, max: 180 } as const
export const GUEST_NAME_MAX = 24

/** How many guests a team of `teamSize` may field: never the whole team. */
export const maxGuests = (rules: GuestRules, teamSize: number): number => Math.min(rules.perTeam ?? teamSize - 1, teamSize - 1)

/** The forms `n` guests add to a team's average limit: the organizer's value, with enough legs for any minimum. */
export const guestForms = (limit: AvgLimit | null, rules: GuestRules | null, n: number): Form[] =>
  limit && rules ? Array.from({ length: n }, () => ({ average: roundAverage(rules.average), legs: limit.minLegs })) : []
