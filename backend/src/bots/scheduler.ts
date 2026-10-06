// Drives a bot seat's turn: schedules its darts and takeout, paced like a real visit, by
// calling the same onUserAction a human's manual entry uses. See
// docs/superpowers/specs/2026-10-06-dart-bots-design.md.
import type { SessionEngine } from '../session/engine.js'
import type { WarnFn } from '../session/replay.js'
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
// A non-x01 session can only reach this scheduler if a bot seat somehow ends up in a game
// that isn't x01 (the lobby guards against this at the source — see LobbyService — but this
// is defense in depth: null, rather than throwing synchronously inside push()).
function x01View(session: Pick<Session, 'module' | 'currentState' | 'players'>): X01ModuleView | null {
  if (session.module.id !== 'x01') return null
  return session.module.view(session.currentState, session.players)
}

export function createBotScheduler(engine: SessionEngine, warn: WarnFn = () => undefined): BotScheduler {
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
    if (!view) return // a bot seat in a non-x01 session: nothing this scheduler knows how to drive
    const dartsThrown = session.openVisitEvents.filter(e => e.kind === 'dart.detected').length
    // The bull off decided (or needs a rethrow) but hasn't flipped stage yet — see act() —
    // is also "nothing to throw right now", paced like the end of a visit.
    const bullOffDecided = view.phase === 'bulloff' && view.bullOff?.result != null
    const visitOver = bullOffDecided || view.visitLocked || dartsThrown >= 3 || view.winner !== null
    const speed = view.config.botSpeed
    const delay = visitOver ? takeoutDelay(speed, session.rng) : dartDelay(speed, session.rng)
    schedule(session.id, delay, () => {
      act(session.id).catch((err: unknown) => {
        // A rejection here (e.g. a transient DB error from appendEvent/insertDarts/deleteDarts
        // inside engine.onUserAction) must never become an unhandled rejection: on this Node
        // version that kills the whole process, taking down every live game, not just this
        // bot's. Logged and swallowed, same discipline as the browser-gw handler applies to a
        // human action that fails to apply.
        //
        // This handler's own body must never throw either: a throwing `warn` (e.g. a logger
        // that itself fails) or a throwing re-entrant onChange would otherwise produce a new
        // unhandled rejection one layer deeper — exactly what this catch exists to prevent.
        // There's nothing further to escalate a secondary failure to here, so it's swallowed.
        try {
          warn('bot action failed', { sessionId: session.id, error: String(err) })
          // Nothing else will retry this bot: a failed action produced no change, so no push
          // follows to re-enter onChange naturally. Re-run it ourselves (if the session is
          // still there and active) so the bot gets another attempt after one more normal
          // pacing delay, rather than being stuck forever on a transient blip.
          const current = engine.getSession(session.id)
          if (current) onChange(current)
        } catch {
          // Swallowed on purpose: see above.
        }
      })
    })
  }

  async function act(sessionId: string): Promise<void> {
    const current = engine.getSession(sessionId)
    if (!current || current.status !== 'active') return
    const upIndex = current.module.getCurrentPlayer(current.currentState)
    const seat = current.seats[upIndex]
    if (!seat.bot) return // the turn moved on, or something changed under us — stop quietly

    const view = x01View(current)
    if (!view) return // defense in depth: see x01View

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
      view.phase === 'bulloff'
        ? BULL
        : pickTarget(view.scores[upIndex] ?? 0, 3 - dartsThrown, view.config.outMode, {
            opened: view.opened[upIndex] ?? true,
            inMode: view.config.inMode,
          })
    const segment = throwAt(target, sigmaForLevel(seat.bot.level), current.rng)
    await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'add_dart', segment })
    // onUserAction's own push (if the action changed anything) re-enters onChange and
    // schedules the next step — nothing more to do here
  }

  return { onChange, stop: clear }
}
