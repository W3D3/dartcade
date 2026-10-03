// The Play page's main button: it picks the game, the lobby holds the people (spec: Every game
// is a lobby). Create lobby / Continue in lobby save the game as the lobby's next game and go
// there; a member of someone else's lobby only opens it.
import { api } from '$lib/api'
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
