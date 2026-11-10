// What a ranked player's clock shows (MM-Match, MM-Match-Reserve boards). Timers are lenient, so the
// clock stays out of the way: nothing shows until the visit or the reserve is nearly gone.
import { clock } from './queue'

/** The turn chip appears for the last seconds of a visit. */
export const VISIT_WARN_SECONDS = 20
/** Once the visit ran over, the reserve chip and banner appear for the last seconds of the reserve. */
export const RESERVE_WARN_SECONDS = 60

export type ClockInput = {
  /** Seconds left of the visit; zero or less once it ran over and the reserve is running. */
  visitLeft: number
  /** Seconds left of the player's (team's) reserve. */
  reserveLeft: number
}

export type ClockView =
  | { phase: 'hidden' }
  /** The visit is nearly over: the turn chip counts down. */
  | { phase: 'visit'; turn: string }
  /** The visit ran over: the turn chip says it is out, the reserve counts down, the banner drains. */
  | { phase: 'reserve'; turn: string; reserve: string; drain: number }

// A countdown reads the whole second still running, so a visit with 0.4 s left says 0:01
export function clockView({ visitLeft, reserveLeft }: ClockInput): ClockView {
  if (visitLeft > VISIT_WARN_SECONDS) return { phase: 'hidden' }
  if (visitLeft > 0) return { phase: 'visit', turn: clock(Math.ceil(visitLeft)) }
  if (reserveLeft > RESERVE_WARN_SECONDS) return { phase: 'hidden' }
  return {
    phase: 'reserve',
    turn: clock(0),
    reserve: clock(Math.ceil(reserveLeft)),
    drain: Math.min(1, Math.max(0, reserveLeft / RESERVE_WARN_SECONDS)),
  }
}

/** How long a disconnected player has to come back before their side forfeits. */
const RECONNECT_SECONDS = 120

/** The opponent is gone: "1:42" until their side forfeits, and how much of the two minutes is left. */
export function reconnectView(deadline: number, now: number): { left: string; drain: number } {
  const seconds = (deadline - now) / 1000
  return { left: clock(Math.ceil(seconds)), drain: Math.min(1, Math.max(0, seconds / RECONNECT_SECONDS)) }
}
