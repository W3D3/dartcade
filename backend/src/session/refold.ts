import type { GameModule, BoardEvent } from './types.js'

export function refoldVisit<S>(
  module: GameModule<S, unknown>,
  committedState: S,
  events: BoardEvent[],
): S {
  return events.reduce(
    (s, e) => module.onBoardEvent(s, e).state,
    committedState,
  )
}
