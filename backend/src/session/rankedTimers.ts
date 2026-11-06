import { bullOffDeadline, deadlines } from './rankedClock.js'
import { bullOffDecided, inBullOff, teamOf } from './apply.js'
import { currentSeat } from './access.js'
import { DISCONNECT_SECONDS } from '../shared/ranked.js'
import type { SystemAction } from './systemInput.js'
import type { Session } from './types.js'

const DISCONNECT_MS = DISCONNECT_SECONDS * 1000

export type RankedTimerDeps = {
  /** Issues a system input to the game (SessionEngine.systemInput). */
  fire: (sessionId: string, action: SystemAction) => Promise<void>
  /** Who has the game open right now. */
  connected: (sessionId: string) => ReadonlySet<string>
  /** Whether the board's bridge is online. */
  boardOnline: (boardId: string) => boolean
  /** Reports a forfeit that couldn't be logged (the timers try again). */
  warn: (message: string, details: unknown) => void
}

/** How long after a forfeit that failed to log the timers look at the game again. */
const RETRY_MS = 5_000

/**
 * The wall clock of a ranked game: the only code that turns time passing into logged inputs (the
 * log, not these timers, is what a replay reads). Per active ranked game it keeps
 *  - one timer for the clock: when the seat that is up has used its visit and its reserve it forfeits;
 *  - one grace timer per player who is away (no game screen open, and none of their boards online):
 *    after DISCONNECT_SECONDS their seats forfeit; coming back cancels it.
 * `sync` re-reads the session and arms what it needs, so it's called after anything that changes
 * the deadline or who is present. Timers are unref'd: they never keep the process alive.
 */
export class RankedTimers {
  private readonly clocks = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly away = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly deps: RankedTimerDeps) {}

  sync(session: Session): void {
    if (session.ranked === null || session.status !== 'active') {
      this.stop(session.id)
      return
    }
    this.armClock(session)
    this.armPresence(session)
  }

  stop(sessionId: string): void {
    clearTimeout(this.clocks.get(sessionId))
    this.clocks.delete(sessionId)
    for (const [key, timer] of this.away) {
      if (!key.startsWith(`${sessionId}|`)) continue
      clearTimeout(timer)
      this.away.delete(key)
    }
  }

  // The seat that forfeits if it doesn't act by `at`, or null when nobody is being waited for: the
  // bull off with its result in waits for a seat to start the game or throw again, and the screens
  // do that on their own
  private due(session: Session, clock: NonNullable<Session['clock']>): { seat: number; at: number } | null {
    const seat = currentSeat(session)
    if (!inBullOff(session, session.currentState)) return { seat, at: deadlines(clock, teamOf(session)[seat]).forfeitAt }
    return bullOffDecided(session, session.currentState) ? null : { seat, at: bullOffDeadline(clock) }
  }

  private armClock(session: Session): void {
    clearTimeout(this.clocks.get(session.id))
    this.clocks.delete(session.id)
    const due = session.clock ? this.due(session, session.clock) : null
    if (!due) return
    const team = teamOf(session)[due.seat]
    const timer = setTimeout(
      () => {
        this.clocks.delete(session.id)
        // The turn may have moved on since this was armed: only a deadline that has really passed forfeits
        if (Date.now() < due.at) {
          this.sync(session)
          return
        }
        const seats = session.seats.flatMap((_, i) => (teamOf(session)[i] === team && !session.forfeited.includes(i) ? [i] : []))
        if (seats.length > 0) this.fire(session, { type: 'clock.forfeit', seats })
      },
      Math.max(0, due.at - Date.now()),
    )
    timer.unref()
    this.clocks.set(session.id, timer)
  }

  // A forfeit the log refused (a database error) mustn't take the process down, nor be forgotten: the
  // timer that issued it is gone, so look at the game again shortly and it arms what's still due
  private fire(session: Session, action: SystemAction): void {
    this.deps.fire(session.id, action).catch((err: unknown) => {
      this.deps.warn('ranked forfeit not logged, trying again', { sessionId: session.id, type: action.type, error: String(err) })
      setTimeout(() => {
        this.sync(session)
      }, RETRY_MS).unref()
    })
  }

  private armPresence(session: Session): void {
    const present = this.deps.connected(session.id)
    const users = new Set(session.seats.filter(s => s.bot === null).map(s => s.controllerUserId))
    for (const user of users) {
      const key = `${session.id}|${user}`
      const here =
        present.has(user) || session.seats.some(s => s.controllerUserId === user && s.boardId !== null && this.deps.boardOnline(s.boardId))
      if (here) {
        clearTimeout(this.away.get(key))
        this.away.delete(key)
      } else if (!this.away.has(key)) {
        const timer = setTimeout(() => {
          this.away.delete(key)
          const seats = session.seats.flatMap((s, i) => (s.controllerUserId === user && !session.forfeited.includes(i) ? [i] : []))
          if (seats.length > 0) this.fire(session, { type: 'presence.forfeit', seats })
        }, DISCONNECT_MS)
        timer.unref()
        this.away.set(key, timer)
      }
    }
  }
}
