// The lifecycles of a tournament and of one of its matches, as transition tables: a state moves
// only by an event its row lists. db/tournaments.ts applies them with a compare-and-set update, so
// a move that raced another (or ran twice) finds the row moved on and does nothing.

export const TOURNAMENT_STATUSES = ['draft', 'open', 'check_in', 'running', 'finished', 'cancelled'] as const
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number]
export type TournamentEvent = 'publish' | 'open_check_in' | 'start' | 'finish' | 'cancel'

/**
 * draft: only its organizers see it. open: published; online entrants register, in person the
 * organizers edit the players. check_in: entrants confirm they are here. running: the bracket is
 * drawn and matches are played. A draft is deleted rather than cancelled.
 */
export const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, Partial<Record<TournamentEvent, TournamentStatus>>> = {
  draft: { publish: 'open' },
  // start straight from open: in person, or online without a check-in window
  open: { open_check_in: 'check_in', start: 'running', cancel: 'cancelled' },
  check_in: { start: 'running', cancel: 'cancelled' },
  running: { finish: 'finished', cancel: 'cancelled' },
  finished: {},
  cancelled: {},
}

export const MATCH_STATUSES = ['pending', 'ready', 'live', 'finished'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]
export type MatchEvent = 'seat' | 'bye' | 'start' | 'abort' | 'finish' | 'walkover' | 'set_result'

/**
 * pending: one side or both still to come ("Winner of QF 2"). ready: both sides known, waiting for
 * them to start (the no-show wait runs from here). live: its game is running. An aborted game puts
 * the match back to ready; an organizer may set or correct a result once both sides are known.
 */
export const MATCH_TRANSITIONS: Record<MatchStatus, Partial<Record<MatchEvent, MatchStatus>>> = {
  pending: { seat: 'ready', bye: 'finished' },
  ready: { start: 'live', walkover: 'finished', set_result: 'finished' },
  live: { finish: 'finished', abort: 'ready', walkover: 'finished' },
  finished: { set_result: 'finished' },
}

export const MATCH_OUTCOMES = ['played', 'walkover', 'bye', 'organizer'] as const
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number]

/** How a finished match was decided, by the event that finished it. */
export const OUTCOME_OF = {
  finish: 'played',
  walkover: 'walkover',
  bye: 'bye',
  set_result: 'organizer',
} as const satisfies Partial<Record<MatchEvent, MatchOutcome>>
export type FinishingMatchEvent = keyof typeof OUTCOME_OF

/** Where `event` takes a tournament in `status`, or null when the table does not allow it. */
export function nextTournamentStatus(status: TournamentStatus, event: TournamentEvent): TournamentStatus | null {
  return TOURNAMENT_TRANSITIONS[status][event] ?? null
}

/** Where `event` takes a match in `status`, or null when the table does not allow it. */
export function nextMatchStatus(status: MatchStatus, event: MatchEvent): MatchStatus | null {
  return MATCH_TRANSITIONS[status][event] ?? null
}

/** Organizers change a tournament (its setup, an in-person one's players) until it starts. */
export const isEditable = (status: TournamentStatus): boolean => status === 'draft' || status === 'open'
