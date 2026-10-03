import { games } from '../games/index.js'
import type { GameConfig, Seat } from '../session/types.js'
import { assignTeams, controllerOf, effectiveReady, isTeamFormat } from './rules.js'
import type { LobbyPerson, LobbyState, StartGame } from './types.js'

/** The game a lobby start creates. */
export type GamePlan = { gameId: string; config: GameConfig; seats: Seat[]; shuffleSeats: boolean; personIds: string[] }

export type PlanProblem =
  | { status: 400; error: string }
  | { status: 409; code: 'board_offline'; error: string; offlineBoards: string[] }
  | { status: 409; code: 'not_ready'; error: string; notReady: { personId: string; name: string }[] }

const BULL_OFF_MODES = new Set(['wdc', 'pdc'])

/** Two lists merged alternately, A1 B1 A2 B2 …; the longer one's leftovers last. */
function interleave<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

/**
 * A team game's seats: the people who play, Team A and Team B each in lobby order,
 * alternating (A1 B1 A2 B2 …), with each seat's team index (A 0, B 1). Someone who plays
 * without a team (the lobby assigns one as they come in, so only as a fallback) gets one
 * as the lobby would. null when a team is empty.
 */
function teamSeating(players: LobbyPerson[]): { players: LobbyPerson[]; teams: number[] } | null {
  const filled = assignTeams({ people: players })
  const teamOf = (p: LobbyPerson) => p.team ?? filled.get(p.id)
  const a = players.filter(p => teamOf(p) === 'A')
  const b = players.filter(p => teamOf(p) === 'B')
  if (a.length === 0 || b.length === 0) return null
  const seated = interleave(a, b)
  return { players: seated, teams: seated.map(p => teamOf(p) === 'A' ? 0 : 1) }
}

/**
 * Who plays (in lobby order), in which seats, with what settings. Hard problems (unknown
 * game, nobody plays, an invalid config) always refuse. `force` (the host confirmed) gets
 * past the two soft ones: an offline board (its seat keeps the board; the match screen
 * falls back to manual entry until it's back) and people who aren't ready. Without force,
 * board_offline is answered before not_ready. The starter and the rows they control (their
 * own, and any guest they added) count as ready: they're about to confirm by starting.
 */
export function planGame(
  lobby: LobbyState,
  game: StartGame,
  opts: { force: boolean; isBoardOnline: (boardId: string) => boolean; starterUserId: string },
): { ok: true; plan: GamePlan } | { ok: false; problem: PlanProblem } {
  const mod = games[game.gameId]
  if (!mod) return { ok: false, problem: { status: 400, error: `unknown game: ${game.gameId}` } }
  const playing = new Set(game.personIds)
  let players = lobby.people.filter(p => playing.has(p.id))
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
  // Teams: seats alternate between them; a random throw order picks the starting team
  // instead of shuffling seats (so the teams keep alternating)
  let shuffleSeats = lobby.throwOrder === 'random'
  if (isTeamFormat(game.gameId, config)) {
    const seating = teamSeating(players)
    if (seating === null) return { ok: false, problem: { status: 400, error: 'Both teams need a player' } }
    players = seating.players
    config.format = 'teams'
    config.teams = seating.teams
    config.teamStart = shuffleSeats ? 'random' : 'first'
    shuffleSeats = false
  }
  const invalid = mod.validate?.(config, players.map(p => ({ name: p.name })))
  if (invalid) return { ok: false, problem: { status: 400, error: `invalid config: ${invalid}` } }

  const offlineBoards = [...new Set(players.flatMap(p =>
    p.boardId !== null && !opts.isBoardOnline(p.boardId) ? [p.boardName ?? p.boardId] : []))]
  if (offlineBoards.length > 0 && !opts.force) {
    return { ok: false, problem: { status: 409, code: 'board_offline', error: `offline: ${offlineBoards.join(', ')}`, offlineBoards } }
  }

  const notReady = players.filter(p => !effectiveReady(lobby, p) && controllerOf(p) !== opts.starterUserId).map(p => ({ personId: p.id, name: p.name }))
  if (notReady.length > 0 && !opts.force) {
    return { ok: false, problem: { status: 409, code: 'not_ready', error: 'not everyone is ready', notReady } }
  }

  return {
    ok: true,
    plan: {
      gameId: game.gameId,
      config,
      shuffleSeats,
      personIds: players.map(p => p.id),
      seats: players.map(p => ({ name: p.name, userId: p.userId, controllerUserId: controllerOf(p), boardId: p.boardId, boardName: p.boardName })),
    },
  }
}
