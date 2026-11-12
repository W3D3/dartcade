// A team's entry (Tournament-Register-Team, Tournament-Confirm-Phone): the captain picks who plays,
// each picked player confirms, and the spot is held while anyone is still to confirm. Pure, shared
// with the SPA: the Who plays? list and the register and change-player routes judge picks alike.
import { entryEligibility, type Eligibility, type Form } from './avgLimit.js'
import type { RegistrationTournament } from './registration.js'

/** A team member as Who plays? judges them. */
export interface Candidate {
  readonly userId: string
  readonly form: Form
  readonly hasBoard: boolean
  /** Holds a spot in this tournament already (another entry). */
  readonly taken: boolean
}

/**
 * count: not teamSize different players. taken: someone holds another spot. not_eligible: the
 * average limit. board_needed: someone has no paired board. In registrationState's order.
 */
export type PickProblem = 'count' | 'taken' | 'not_eligible' | 'board_needed'

/** What stands in the way of these picks (null: none), and how they fare against the average limit (null without one). */
export function pickProblem(
  t: Pick<RegistrationTournament, 'teamSize' | 'settings'>,
  picked: readonly Candidate[],
): { problem: PickProblem | null; eligibility: Eligibility | null } {
  const limit = t.settings.avgLimit
  const eligibility =
    limit === null || picked.length === 0
      ? null
      : entryEligibility(
          limit,
          picked.map(p => p.form),
        )
  const distinct = new Set(picked.map(p => p.userId)).size === picked.length
  const problem: PickProblem | null =
    picked.length !== t.teamSize || !distinct
      ? 'count'
      : picked.some(p => p.taken)
        ? 'taken'
        : eligibility !== null && !eligibility.eligible
          ? 'not_eligible'
          : !t.settings.manualScoring && picked.some(p => !p.hasBoard)
            ? 'board_needed'
            : null
  return { problem, eligibility }
}

/** One place in a team's entry: who holds it (null once they declined) and whether they confirmed. */
export interface RosterSlot {
  readonly position: number
  readonly user: { readonly id: string; readonly name: string } | null
  readonly confirmed: boolean
}

/** Every place of a team of `teamSize`, the empty ones (left by a decline) included, in order. */
export function slotsOf(players: readonly RosterSlot[], teamSize: number): RosterSlot[] {
  return Array.from(
    { length: teamSize },
    (_, position) => players.find(p => p.position === position) ?? { position, user: null, confirmed: false },
  )
}

/** The entry is complete once every place is held by someone who confirmed. */
export const rosterComplete = (players: readonly RosterSlot[], teamSize: number): boolean =>
  slotsOf(players, teamSize).every(s => s.user !== null && s.confirmed)

/** The picked players still to confirm. */
export const waitingFor = (players: readonly RosterSlot[]): RosterSlot[] => players.filter(s => s.user !== null && !s.confirmed)

/** A captain reminds the players still to confirm at most this often. */
export const REMIND_EVERY_MS = 15 * 60_000
