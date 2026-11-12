import type { GameId, TriggerKind } from './types.js'

/** The game a trigger belongs to, for grouping the effects by game; null: every game (or none).
 *  One entry per trigger, so a new trigger fails the typecheck until it is placed. */
export const TRIGGER_GAME: Record<TriggerKind, GameId | null> = {
  turn: null,
  'game.won': null,
  'bulloff.won': null,
  lobby: null,
  'takeout.started': null,
  'takeout.finished': null,
  'calibration.finished': null,
  visit: 'x01',
  bust: 'x01',
  checkout: 'x01',
  'cricket.closed': 'cricket',
  'p121.made': 'p121',
  'golf.sunk': 'minigolf',
  'hilo.lifeLost': 'hilo',
}

/** The order of the groups in the effects list: General first, then the games. A game with no effect has no group. */
export const GROUP_ORDER: readonly (GameId | null)[] = [null, 'x01', 'atc', 'cricket', 'p121', 'minigolf', 'hilo']
