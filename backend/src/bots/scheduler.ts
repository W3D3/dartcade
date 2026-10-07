// Drives a bot seat's turn: schedules its darts and takeout, paced like a real visit, by
// calling the same onUserAction a human's manual entry uses. See
// docs/superpowers/specs/2026-10-06-dart-bots-design.md. This scheduler has no knowledge of
// any particular game — it only knows how to drive a `GameModule` that defines `botTarget`
// (see session/types.ts), and how to run a bull off in front of one (any `withBullOff`-wrapped
// game, generically).
import type { SessionEngine } from '../session/engine.js'
import type { WarnFn } from '../session/replay.js'
import type { Session } from '../session/types.js'
import type { BullOffViewField } from '../session/views.js'
import { BULL, throwAt } from './accuracy.js'
import { sigmaForLevel } from './levels.js'
import { dartDelay, takeoutDelay, type BotSpeed } from './pacing.js'

export type BotScheduler = {
  /** Call after every snapshot push: schedules the up seat's next dart if it's a bot and
   *  nothing is already scheduled for this session. */
  onChange(session: Session): void
  /** Cancels any pending timer for a session (it's ended, aborted, or forgotten). */
  stop(sessionId: string): void
}

/**
 * The minimal view shape the scheduler needs to drive any bot-capable game, regardless of
 * which module produced it: who's won, whether the visit is locked, how fast its bots throw,
 * and — only when the session is withBullOff-wrapped — the bull-off phase and state (see
 * `BullOffViewField` in session/views.ts).
 *
 * This isn't enforced through `AnyGameModule`'s union type at the one call site below
 * (`botCapableView`): `session.module.view(...)` is statically typed as the union of every
 * registered game's own view type (e.g. `X01ModuleView | AtcView`), and ATC's view satisfies
 * none of this (it has no `visitLocked` or `config.botSpeed`) — correctly, since ATC never
 * defines `botTarget`. Narrowing "this module defines botTarget" to "this module's view
 * satisfies BotCapableView" isn't expressible through that union without real contortion, so
 * `botCapableView` below checks the shape with a real (if light) runtime guard instead of an
 * `as` assertion — every module that defines `botTarget` is expected, by convention, to
 * produce a view satisfying this shape (X01's own view does), and the guard's job is only to
 * fail loudly if a future module breaks that convention rather than silently misbehaving.
 */
export type BotCapableView = {
  winner: number | null
  visitLocked: boolean
  config: { botSpeed: BotSpeed }
} & Partial<BullOffViewField> & { phase?: string }

function isBotCapableView(v: object): v is BotCapableView {
  if (!('winner' in v) || !('visitLocked' in v) || !('config' in v)) return false
  const { config }: { config: unknown } = v
  if (typeof config !== 'object' || config === null || !('botSpeed' in config)) return false
  const { botSpeed }: { botSpeed: unknown } = config
  return typeof botSpeed === 'string'
}

function botCapableView(session: Pick<Session, 'module' | 'currentState' | 'players'>): BotCapableView {
  const view = session.module.view(session.currentState, session.players)
  if (!isBotCapableView(view)) {
    // Should never happen: see this function's and BotCapableView's doc. Fail loudly instead
    // of letting the scheduler read undefined fields and misbehave silently.
    throw new Error(`bot-capable module '${session.module.id}' produced a view missing winner/visitLocked/config.botSpeed`)
  }
  return view
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
    // A bot seat in a module that defines no botTarget: nothing this scheduler knows how to
    // drive. The lobby guards against this at the source (see LobbyService, games/index.ts's
    // supportsBots), but this is defense in depth: no-op, rather than throwing synchronously
    // inside push().
    if (!session.module.botTarget) return
    const rawView = session.module.view(session.currentState, session.players)
    if (!isBotCapableView(rawView)) {
      // Should never happen: see BotCapableView's doc — a module that defines botTarget is
      // expected to produce a view satisfying this shape. But onChange runs synchronously
      // inside push() (including rebuildOne on restart, where it's not caught and would abort
      // the whole session), so unlike act() below — where a throw becomes a rejected promise
      // caught by its own .catch() — a throw here would surface as an error on an already-
      // applied human action, or abort a restart. Warn and no-op instead, same as the "no
      // botTarget defined" case just above.
      warn('bot-capable module produced a view missing winner/visitLocked/config.botSpeed', {
        sessionId: session.id,
        moduleId: session.module.id,
      })
      return
    }
    const view = rawView
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

    if (!current.module.botTarget) return // defense in depth: see onChange

    const view = botCapableView(current)

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

    // A bull-off throw is a different mini-game than any wrapped module's own scoring: aim at
    // the bull directly, without ever asking the module itself — it has no notion of "this is
    // a bull off" (and shouldn't need one), so botTarget is never called for this phase.
    if (view.phase === 'bulloff') {
      const { segment, coords } = throwAt(BULL, sigmaForLevel(seat.bot.level), current.rng)
      await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'add_dart', segment, coords })
      return
    }

    const target = current.module.botTarget(current.currentState, upIndex, dartsThrown)
    if (target === 'takeout') {
      await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'takeout' })
      return
    }
    if (target === null) return // defensive: nothing scheduled this round (shouldn't come up)
    const { segment, coords } = throwAt(target, sigmaForLevel(seat.bot.level), current.rng)
    await engine.onUserAction(sessionId, seat.controllerUserId, { type: 'add_dart', segment, coords })
    // onUserAction's own push (if the action changed anything) re-enters onChange and
    // schedules the next step — nothing more to do here
  }

  return { onChange, stop: clear }
}
