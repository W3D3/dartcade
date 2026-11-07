import { PLACEMENT_MATCHES, RESERVE_SECONDS, VISIT_SECONDS } from '../shared/ranked.js'
import { deadlines, reserveLeft } from './rankedClock.js'
import { inBullOff, teamOf } from './apply.js'
import { currentSeat } from './access.js'
import type { Snapshot } from './types.js'
import type { Session } from './types.js'
import type { RankedOutcome } from '../db/ranked.js'

export type RankedState = NonNullable<Snapshot['ranked']>

/** Who has the screen open, and when each away player's grace ends. */
export type RankedPresence = {
  connected: ReadonlySet<string>
  /** When the user's grace ends (ms); null while they are here. */
  awayUntil: (userId: string) => number | null
}

/**
 * The ranked part of a game's snapshot (RankedState in schema/game-ws-v1.json): the clock the
 * screens count down, each seat's reserve, rank, stakes and, once recorded, what the game did to them.
 * Null for a game that isn't ranked. Pure: the same session and time give the same state.
 */
export function rankedState(
  session: Session,
  now: number,
  presence: RankedPresence,
  outcomes: ReadonlyMap<string, RankedOutcome> | undefined,
): RankedState | null {
  const game = session.ranked
  if (game === null) return null
  const clock = session.clock
  const teams = teamOf(session)
  const up = currentSeat(session)
  // The visit clock runs for the seat that is up, in a game that is on and past the bull off
  const running = clock !== null && session.status === 'active' && !inBullOff(session, session.currentState)
  const due = running ? deadlines(clock, teams[up]) : null
  const iso = (ms: number) => new Date(ms).toISOString()
  return {
    now: iso(now),
    mode: game.mode,
    visitSeconds: game.rules?.visitSeconds ?? VISIT_SECONDS,
    reserveSeconds: game.rules?.reserveSeconds ?? RESERVE_SECONDS,
    manualEntry: game.rules?.manualEntry ?? true,
    visitDeadline: due ? iso(due.visitDeadline) : null,
    forfeitAt: due ? iso(due.forfeitAt) : null,
    seats: session.seats.map((s, i) => {
      const entry = s.userId === null ? undefined : game.entries[s.userId]
      const isUp = teams[i] === teams[up]
      const outcome = s.userId === null ? undefined : outcomes?.get(s.userId)
      const away = session.status === 'active' ? presence.awayUntil(s.controllerUserId) : null
      const placing = entry !== undefined && entry.matches < PLACEMENT_MATCHES
      return {
        reserveSeconds: clock
          ? Math.floor(reserveLeft(clock, teams[i], due !== null && isUp, now) / 1000)
          : (game.rules?.reserveSeconds ?? RESERVE_SECONDS),
        inReserve: due !== null && isUp && now > due.visitDeadline,
        disconnectForfeitAt: away === null ? null : iso(away),
        stakes: entry?.stakes ?? null,
        rating: entry === undefined || placing ? null : entry.rating,
        rankIndex: entry?.rankIndex ?? null,
        placement: placing ? { played: entry.matches, of: PLACEMENT_MATCHES } : null,
        result: outcome
          ? { change: outcome.change, rankIndexBefore: outcome.rankIndexBefore, rankIndexAfter: outcome.rankIndexAfter }
          : null,
      }
    }),
  }
}
