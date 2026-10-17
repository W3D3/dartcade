// The Play page's main button: it picks the game, the lobby holds the people (spec: Every game
// is a lobby). Choose players saves the game as your lobby's next game (opening one if you have
// none) and goes there; a member of someone else's lobby only opens it. New lobby starts over.
import { api, type GameInfo } from '$lib/api'
import type { LobbySummary } from '$lib/api/lobby-ws'
import { createLobby } from './create'
import { lobbyActions } from './actions'
import { describeConflict } from './input'
import type { OwnBoard } from './rules'

export type PlayAction = 'create' | 'continue' | 'open'

/** Which main button the Play page shows, from /ws/me's summary of your lobby. */
export function playAction(lobby: Pick<LobbySummary, 'youHost'> | null): PlayAction {
  if (!lobby) return 'create'
  return lobby.youHost ? 'continue' : 'open'
}

const LABELS: Record<PlayAction, string> = { create: 'Choose players', continue: 'Choose players', open: 'Open lobby' }

/** The main button's text: the next step (picking the people) unless it's someone else's lobby. */
export function playLabel(action: PlayAction): string {
  return LABELS[action]
}

/** "New lobby" under the main button: only for the host of a solo lobby with no game running (nobody gets left behind). */
export function offersNewLobby(lobby: Pick<LobbySummary, 'youHost' | 'solo' | 'sessionId'> | null): boolean {
  return lobby !== null && lobby.youHost && lobby.solo && lobby.sessionId === null
}

/** The lobby page, carrying the board picked with "Play on this board" (it moves your row there). */
export function lobbyPath(board: string | null): string {
  return board ? `/lobby?board=${encodeURIComponent(board)}` : '/lobby'
}

/** The board to move your row to: one of your boards that you aren't on yet, else null. */
export function boardToApply(target: string | null, current: string | null, own: OwnBoard[]): string | null {
  if (!target || target === current || !own.some(b => b.id === target)) return null
  return target
}

export type NextGame = { gameId: string; config: Record<string, unknown> }

/**
 * The picked mode and its settings, as the Play page's form saves them: the mode's id (falling
 * back to a 501 game, then whatever's first, if the picked one isn't among the backend's games)
 * and the fields of `config` that mode's configMeta lists. The form's config also carries other
 * modes' fields (it starts from X01's defaults), which stay out; so do `teams` and `teamStart`,
 * which the lobby sets at the start. null when the backend has no games at all.
 */
export function chosenGame(
  games: Pick<GameInfo, 'id' | 'configMeta'>[],
  selectedMode: string,
  config: Record<string, unknown>,
): NextGame | null {
  const game = games.find(g => g.id === selectedMode) ?? games.find(g => g.id.includes('501')) ?? games.at(0)
  if (!game) return null
  const settings = Object.fromEntries(
    Object.keys(game.configMeta)
      .filter(k => k in config)
      .map(k => [k, config[k]]),
  )
  return { gameId: game.id, config: settings }
}

/**
 * Saves the game as the next game of your lobby: `lobbyId` when you have one, else a new one.
 * A new one refused with in_lobby means you have one already (another tab opened it): that one
 * gets the game. Resolves null when it went through, else the message to show.
 */
export async function saveNextGame(lobbyId: string | null, game: NextGame): Promise<string | null> {
  let id = lobbyId
  if (!id) {
    const created = await createLobby()
    if (created.ok) id = created.lobbyId
    else if (!created.inLobby) return created.message
    else id = (await api.GET('/api/lobbies/current')).data?.id ?? null
  }
  if (!id) return 'Could not open your lobby'
  const { error } = await lobbyActions(id).updateLobby({ nextGame: game })
  return error ? describeConflict(error) : null
}

/** New lobby: closes yours (guests and bots go with it) and opens a fresh one with the game. Null when done, else the message. */
export async function startFreshLobby(lobbyId: string, game: NextGame): Promise<string | null> {
  const { error } = await api.POST('/api/lobbies/{id}/close', { params: { path: { id: lobbyId } } })
  if (error) return describeConflict(error)
  return saveNextGame(null, game)
}
