import type { BoardEvent, Effect, GameModule, Player, UserAction } from './types.js'
import type { BullOffViewField } from './views.js'
import {
  clearCurrentBullOffThrow,
  initBullOff,
  onBullOffDart,
  onBullOffTakeout,
  rethrowBullOff,
  skipBullOffThrow,
  type BullOffMode,
  type BullOffState,
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
export function withBullOff<S, Cfg extends BullOffGameConfig, V extends object, Id extends string, D>(
  game: GameModule<S, Cfg, V, Id, D>,
  hooks: BullOffHooks<S>,
): GameModule<WithBullOffState<S>, Cfg, V & BullOffViewField, Id, D> {
  // `order` is the bull off's result
  function startGame(s: WithBullOffState<S>, order: number[]): WithBullOffState<S> {
    return { ...s, stage: 'game', game: hooks.applyStartOrder(s.game, order) }
  }

  // Pass a game-stage result through, keeping the wrapper around it.
  function inGame(s: WithBullOffState<S>, r: { state: S; effects?: Effect[] }) {
    return { state: { ...s, game: r.state }, effects: r.effects }
  }

  const teamsOf = game.teamsOf?.bind(game)
  return {
    id: game.id,
    version: game.version,
    teams: game.teams,
    teamsOf: teamsOf && (s => teamsOf(s.game)),
    getLeg: s => game.getLeg?.(s.game) ?? 0,
    summarize: (s, ctx) => game.summarize(s.game, ctx),
    // Empty when the game has no throw order of its own (results() then uses seat order)
    throwOrder: s => game.throwOrder?.(s.game) ?? [],
    // Bull off visits stay in the list (phase 'bulloff'); the game decides what to show
    detail: (visits, final) =>
      game.detail(
        visits.map(v => ({ ...v, start: v.start.game, end: v.end.game, after: v.after.game })),
        final.game,
      ),
    defaultConfig: { bullOff: 'off', ...game.defaultConfig },
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

    init(cfg, players, rng) {
      const n = players.length
      // A bull off decides throw order between players, so it needs at least two.
      // validate() rejects such new games; this also covers sessions created
      // before that check existed when they are rebuilt.
      const doBullOff = enabled(cfg) && n >= 2
      return {
        stage: doBullOff ? 'bulloff' : 'game',
        bullOff: initBullOff({ mode: doBullOff ? (cfg.bullOff ?? 'off') : 'off', playerCount: n }),
        game: game.init(cfg, players, rng),
      }
    },

    // Whoever throws next: the bull off's thrower, then (once it's decided) the winner, whose
    // next visit starts the game. A rethrow starts with the last thrower, who is still current.
    getCurrentPlayer(s) {
      if (s.stage === 'game') return game.getCurrentPlayer(s.game)
      const { result, currentPlayer } = s.bullOff
      return result && !result.rethrow ? result.order[0] : currentPlayer
    },

    onBoardEvent(s, e: BoardEvent) {
      if (s.stage === 'game') return inGame(s, game.onBoardEvent(s.game, e))

      const bullOff = s.bullOff
      switch (e.kind) {
        case 'visit.opened': {
          if (!bullOff.result) return { state: s }
          // The next visit after a result either rethrows or is the game's first visit.
          if (bullOff.result.rethrow) return { state: { ...s, bullOff: rethrowBullOff(bullOff) } }
          const started = startGame(s, bullOff.result.order)
          return inGame(started, game.onBoardEvent(started.game, e))
        }
        case 'dart.detected':
          return { state: { ...s, bullOff: onBullOffDart(bullOff, e.data.dart) } }
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
          return { state: s.bullOff.result && !s.bullOff.result.rethrow ? startGame(s, s.bullOff.result.order) : s }
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
        bullOff: { throws: b.throws, sequence: b.sequence, currentPlayer: b.currentPlayer, result: b.result },
      }
    },
  }
}
