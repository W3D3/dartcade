// Drives a bot seat's turn: schedules its darts and takeout, paced like a real visit, by
// calling the same onUserAction a human's manual entry uses. See
// docs/superpowers/specs/2026-10-06-dart-bots-design.md.
import type { SessionEngine } from '../session/engine.js'
import type { Session } from '../session/types.js'
import type { X01ModuleView } from '../session/views.js'
import { BULL, pickTarget, throwAt } from './accuracy.js'
import { sigmaForLevel } from './levels.js'
import { dartDelay, takeoutDelay } from './pacing.js'

export type BotScheduler = {
  /** Call after every snapshot push: schedules the up seat's next dart if it's a bot and
   *  nothing is already scheduled for this session. */
  onChange(session: Session): void
  /** Cancels any pending timer for a session (it's ended, aborted, or forgotten). */
  stop(sessionId: string): void
}

// The X01 view, the only shape this scheduler ever deals with (bots are X01-only per the
// spec's scope). Reading through view() — not session.committedState — matters: X01 sessions
// are always withBullOff-wrapped ({ stage, bullOff, game }), so committedState.cfg doesn't
// exist; view() already flattens that away into one flat shape regardless of bull-off stage.
function x01View(session: Pick<Session, 'module' | 'currentState' | 'players'>): X01ModuleView {
  if (session.module.id !== 'x01') throw new Error(`bot scheduler only supports x01 sessions, got ${session.module.id}`)
  return session.module.view(session.currentState, session.players)
}

export function createBotScheduler(engine: SessionEngine): BotScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function clear(sessionId: string): void {
    const t = timers.get(sessionId)
    if (t) clearTimeout(t)
    timers.delete(sessionId)
  }

  function schedule(sessionId: string, delay: number, run: () => void): void {
    clear(sessionId)
    timers.set(
      sessionId,
      setTimeout(() => {
        timers.delete(sessionId)
        run()
      }, delay),
    )
  }

  function onChange(session: Session): void {
    if (session.status !== 'active') {
      clear(session.id)
      return
    }
    const upIndex = session.module.getCurrentPlayer(session.currentState)
    const seat = session.seats[upIndex]
    if (!seat.bot) return
    if (timers.has(session.id)) return // already scheduled
    const view = x01View(session)
    const dartsThrown = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
    // The bull off decided (or needs a rethrow) but hasn't flipped stage yet — see act() —
    // is also "nothing to throw right now", paced like the end of a visit.
    const bullOffDecided = view.phase === 'bulloff' && view.bullOff?.result != null
    const visitOver = bullOffDecided || view.visitLocked || dartsThrown >= 3 || view.winner !== null
    const speed = view.config.botSpeed
    const delay = visitOver ? takeoutDelay(speed, session.rng) : dartDelay(speed, session.rng)
    schedule(session.id, delay, () => void act(session.id))
  }

  async function act(sessionId: string): Promise<void> {
    const current = engine.getSession(sessionId)
    if (!current || current.status !== 'active') return
    const upIndex = current.module.getCurrentPlayer(current.currentState)
    const seat = current.seats[upIndex]
    if (!seat.bot) return // the turn moved on, or something changed under us — stop quietly

    const view = x01View(current)

    // The bull off has a result (a final order, or a rethrow) but stage is still 'bulloff':
    // that flip only happens when the engine processes the *next* visit.opened, which a real
    // board sends on its own once the winner's board resets for their first throw. Boardless
    // play (every seat here can be a bot) has no board to do that, so it needs the same
    // explicit nudge a human host's "Start now"/rethrow button in BullOffPanel.svelte sends —
    // bulloff_start/bulloff_rethrow aren't seat actions (SEAT_ACTIONS), only the host may send
    // them, so this goes out as the session owner rather than the current seat's controller.
    if (view.phase === 'bulloff' && view.bullOff?.result) {
      await engine.onUserAction(sessionId, current.ownerUserId, {
        type: view.bullOff.result.rethrow ? 'bulloff_rethrow' : 'bulloff_start',
      })
      return
    }

    const dartsThrown = current.openVisitEvents.filter(e => e.kind === 'dart.detected').length
    const visitOver = view.visitLocked || dartsThrown >= 3 || view.winner !== null

    if (visitOver) {
      await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'takeout' })
      return
    }

    // A bull-off throw is a different mini-game, not X01 scoring: aim at the bull, not
    // wherever pickTarget's checkout/treble-20 logic would send a dart at the session's
    // starting score (pickTarget has no notion of "this is a bull off", and shouldn't need one).
    const target =
      view.phase === 'bulloff' ? BULL : pickTarget(view.scores[upIndex] ?? 0, 3 - dartsThrown, view.config.outMode)
    const segment = throwAt(target, sigmaForLevel(seat.bot.level), current.rng)
    await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'add_dart', segment })
    // onUserAction's own push (if the action changed anything) re-enters onChange and
    // schedules the next step — nothing more to do here
  }

  return { onChange, stop: clear }
}
