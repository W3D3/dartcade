import type { BoardEvent, DartDetectedData, GameModule, Player, UserAction } from './types.js'
import {
  clearCurrentBullOffThrow, initBullOff, onBullOffDart, onBullOffTakeout, rethrowBullOff,
  skipBullOffThrow, type BullOffMode, type BullOffState,
} from './bullOff.js'

/** Game state wrapped with an optional bull off that decides the throwing order first. */
export type WithBullOffState<S> = {
  stage: 'bulloff' | 'game'
  bullOff: BullOffState
  game: S
}

export type BullOffGameConfig = { bullOff?: BullOffMode }

export type BullOffHooks<S> = {
  /** Start the game with players throwing in this order (closest to the bull first). */
  applyStartOrder(s: S, order: number[]): S
}

// A missing bullOff means the default ('off')
function enabled(cfg: BullOffGameConfig): boolean {
  return (cfg.bullOff ?? 'off') !== 'off'
}

/**
 * Adds a bull off in front of any game module. The bull off runs on board events
 * and its own user actions (bulloff_skip, bulloff_rethrow, bulloff_start); once it
 * has a result the game starts via `applyStartOrder` and everything else is
 * passed through unchanged.
 */
export function withBullOff<S, Cfg extends BullOffGameConfig>(
  game: GameModule<S, Cfg>,
  hooks: BullOffHooks<S>,
): GameModule<WithBullOffState<S>, Cfg> {
  function startGame(s: WithBullOffState<S>): WithBullOffState<S> {
    const order = s.bullOff.result!.order
    return { ...s, stage: 'game', game: hooks.applyStartOrder(s.game, order) }
  }

  // Pass a game-stage result through, keeping the wrapper around it.
  function inGame(s: WithBullOffState<S>, r: { state: S; effects?: any[] }) {
    return { state: { ...s, game: r.state }, effects: r.effects }
  }

  return {
    id: game.id,
    defaultConfig: { bullOff: 'off', ...game.defaultConfig } as Cfg,
    configMeta: {
      ...game.configMeta,
      bullOff: game.configMeta?.bullOff ?? {
        label: 'Bull off',
        tooltip: 'Who throws first. One dart each, closest to the centre starts.',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'wdc', label: 'WDC' },
          { value: 'pdc', label: 'PDC' },
        ],
      },
    },

    validate(cfg, players) {
      if (enabled(cfg) && players.length < 2) return 'bull off needs at least two players'
      return game.validate?.(cfg, players) ?? null
    },

    init(cfg, players) {
      const n = players.length
      // A bull off decides throw order between players, so it needs at least two.
      // validate() rejects such new games; this also covers sessions created
      // before that check existed when they are rebuilt.
      const doBullOff = enabled(cfg) && n >= 2
      return {
        stage: doBullOff ? 'bulloff' : 'game',
        bullOff: initBullOff({ mode: doBullOff ? cfg.bullOff! : 'off', playerCount: n }),
        game: game.init(cfg, players),
      }
    },

    getCurrentPlayer(s) {
      return s.stage === 'bulloff' ? s.bullOff.currentPlayer : game.getCurrentPlayer(s.game)
    },

    onBoardEvent(s, e: BoardEvent) {
      if (s.stage === 'game') return inGame(s, game.onBoardEvent(s.game, e))

      const bullOff = s.bullOff
      switch (e.kind) {
        case 'visit.opened': {
          if (!bullOff.result) return { state: s }
          // The next visit after a result either rethrows or is the game's first visit.
          if (bullOff.result.rethrow) return { state: { ...s, bullOff: rethrowBullOff(bullOff) } }
          const started = startGame(s)
          return inGame(started, game.onBoardEvent(started.game, e))
        }
        case 'dart.detected':
          return { state: { ...s, bullOff: onBullOffDart(bullOff, (e.data as DartDetectedData).dart) } }
        case 'takeout.finished':
          return { state: { ...s, bullOff: onBullOffTakeout(bullOff) } }
        case 'visit.cleared':
          return { state: { ...s, bullOff: clearCurrentBullOffThrow(bullOff) } }
        default:
          return { state: s }
      }
    },

    onUserAction(s, a: UserAction) {
      if (s.stage === 'game') return inGame(s, game.onUserAction(s.game, a))

      switch (a.type) {
        case 'bulloff_skip':
          return { state: { ...s, bullOff: skipBullOffThrow(s.bullOff) } }
        case 'bulloff_rethrow':
          return { state: { ...s, bullOff: rethrowBullOff(s.bullOff) } }
        case 'bulloff_start':
          return { state: s.bullOff.result && !s.bullOff.result.rethrow ? startGame(s) : s }
        default:
          return { state: s }
      }
    },

    view(s, players: Player[]) {
      const inner = game.view(s.game, players)
      if (s.stage === 'game') return { ...inner, bullOff: null }
      const b = s.bullOff
      return {
        ...inner,
        phase: 'bulloff',
        currentPlayer: b.currentPlayer,
        // Only a player's first dart counts; lock the visit once it's in.
        visitLocked: b.result !== null || b.throws[b.currentPlayer] !== null,
        bullOff: { throws: b.throws, currentPlayer: b.currentPlayer, result: b.result },
      }
    },
  }
}
