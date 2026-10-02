import { games } from '../games/index.js'
import type { GameConfig, Seat } from '../session/types.js'
import { controllerOf } from './rules.js'
import type { LastGame, LobbyState } from './types.js'

/** The game a lobby start (or rematch) creates. */
export type GamePlan = { gameId: string; config: GameConfig; seats: Seat[]; shuffleSeats: boolean; personIds: string[] }

export type PlanProblem =
  | { status: 400; error: string }
  | { status: 409; code: 'board_offline'; error: string; offlineBoards: string[] }
  | { status: 409; code: 'not_ready'; error: string; notReady: { personId: string; name: string }[] }

const BULL_OFF_MODES = new Set(['wdc', 'pdc'])

/**
 * Who plays (in lobby order), in which seats, with what settings. Hard problems come
 * first; `force` (the host confirmed) only gets past people who aren't ready.
 */
export function planGame(
  lobby: LobbyState,
  game: LastGame,
  opts: { force: boolean; isBoardOnline: (boardId: string) => boolean },
): { ok: true; plan: GamePlan } | { ok: false; problem: PlanProblem } {
  const mod = games[game.gameId]
  if (!mod) return { ok: false, problem: { status: 400, error: `unknown game: ${game.gameId}` } }
  const playing = new Set(game.personIds)
  const players = lobby.people.filter(p => playing.has(p.id))
  if (players.length === 0) return { ok: false, problem: { status: 400, error: 'nobody plays' } }

  // The lobby's throw order decides the game's own bull off setting
  const hasBullOff = 'bullOff' in mod.defaultConfig
  if (lobby.throwOrder === 'bulloff' && !hasBullOff) {
    return { ok: false, problem: { status: 400, error: `${game.gameId} has no bull off: pick another throw order` } }
  }
  const config: GameConfig = { ...mod.defaultConfig, ...game.config }
  if (hasBullOff) {
    const chosen = config.bullOff
    const keep = typeof chosen === 'string' && BULL_OFF_MODES.has(chosen)
    config.bullOff = lobby.throwOrder !== 'bulloff' ? 'off' : keep ? chosen : 'wdc'
  }
  const invalid = mod.validate?.(config, players.map(p => ({ name: p.name })))
  if (invalid) return { ok: false, problem: { status: 400, error: `invalid config: ${invalid}` } }

  const offlineBoards = [...new Set(players.flatMap(p =>
    p.boardId !== null && !opts.isBoardOnline(p.boardId) ? [p.boardName ?? p.boardId] : []))]
  if (offlineBoards.length > 0) {
    return { ok: false, problem: { status: 409, code: 'board_offline', error: `offline: ${offlineBoards.join(', ')}`, offlineBoards } }
  }

  const notReady = players.filter(p => !p.ready).map(p => ({ personId: p.id, name: p.name }))
  if (notReady.length > 0 && !opts.force) {
    return { ok: false, problem: { status: 409, code: 'not_ready', error: 'not everyone is ready', notReady } }
  }

  return {
    ok: true,
    plan: {
      gameId: game.gameId,
      config,
      shuffleSeats: lobby.throwOrder === 'random',
      personIds: players.map(p => p.id),
      seats: players.map(p => ({ name: p.name, userId: p.userId, controllerUserId: controllerOf(p), boardId: p.boardId, boardName: p.boardName })),
    },
  }
}
