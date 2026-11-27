import type { GameModule, BoardEvent } from './types.js'

/**
 * The state after the open visit's events. `thrownAt` holds each dart's time (ms since the epoch), in
 * order: a game that keeps time hears it before the dart, so a corrected visit folds exactly as if
 * the right darts had been thrown at those times.
 */
export function refoldVisit<S>(
  module: GameModule<S, unknown>,
  committedState: S,
  events: BoardEvent[],
  thrownAt: readonly number[] = [],
): S {
  let dart = 0
  return events.reduce((s, e) => {
    const at = e.kind === 'dart.detected' ? thrownAt.at(dart++) : undefined
    const timed = at !== undefined && module.onClock ? module.onClock(s, at, s) : s
    return module.onBoardEvent(timed, e).state
  }, committedState)
}
