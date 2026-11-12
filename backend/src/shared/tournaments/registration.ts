// Whether someone may register for a tournament now, and if not why: one rule for the Register
// button on Browse and the register route's answer. Pure, shared with the SPA.
import type { TournamentAccess } from './setup.js'
import type { TournamentStatus } from './state.js'

export interface RegistrationTournament {
  readonly status: TournamentStatus
  readonly access: TournamentAccess
  readonly teamSize: number
  readonly maxEntries: number
  /** Entries registered so far, withdrawn ones not counted. */
  readonly entries: number
  readonly startsAt: string | null
  readonly settings: { readonly registrationClosesMinutes: number | null; readonly manualScoring: boolean }
}

/**
 * `registered`: the caller has a spot. `in_person`: the organizers add everyone. `closed`: not
 * open, or past the registration close. `team`: a team registers through its captain.
 * `full`: every spot taken. `board_needed`: online play needs a paired board unless the organizer
 * allows manual scoring. `open`: Register.
 */
export type RegistrationState = 'registered' | 'in_person' | 'closed' | 'team' | 'full' | 'board_needed' | 'open'

/** When registration closes before a fixed start; null while an organizer starts it. */
export function registrationClosesAt(t: Pick<RegistrationTournament, 'startsAt' | 'settings'>): string | null {
  if (t.startsAt === null) return null
  return new Date(Date.parse(t.startsAt) - (t.settings.registrationClosesMinutes ?? 0) * 60_000).toISOString()
}

export function registrationState(
  t: RegistrationTournament,
  me: { readonly registered: boolean; readonly hasBoard: boolean },
  now: Date,
): RegistrationState {
  if (me.registered) return 'registered'
  if (t.access === 'in_person') return 'in_person'
  const closes = registrationClosesAt(t)
  if (t.status !== 'open' || (closes !== null && Date.parse(closes) <= now.getTime())) return 'closed'
  if (t.teamSize > 1) return 'team'
  if (t.entries >= t.maxEntries) return 'full'
  if (!t.settings.manualScoring && !me.hasBoard) return 'board_needed'
  return 'open'
}

/** A withdrawal is possible until the tournament is over; once it runs, the matches left are lost by walkover (Q12). */
export const canWithdraw = (status: TournamentStatus): boolean => status === 'open' || status === 'check_in' || status === 'running'
