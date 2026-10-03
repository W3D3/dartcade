// Starting a lobby game with the soft ready gate: a start problem shows in a dialog, the host
// can start anyway (an offline board on manual entry, or people who aren't ready) or go back.
import { api } from '$lib/api'
import type { Refusal } from './input'

export type StartOutcome =
  | { kind: 'started'; sessionId: string }
  | { kind: 'problem'; code: 'board_offline'; offlineBoards: string[] }
  | { kind: 'problem'; code: 'not_ready'; notReady: string[] }
  | { kind: 'problem'; code: 'other'; refusal: Refusal }

/** Which dialog to show, straight from the server's `code` (no client rules). */
export function startOutcome(data: { sessionId: string } | undefined, error: Refusal | undefined): StartOutcome {
  if (data) return { kind: 'started', sessionId: data.sessionId }
  if (error?.code === 'board_offline') return { kind: 'problem', code: 'board_offline', offlineBoards: error.offlineBoards ?? [] }
  if (error?.code === 'not_ready') return { kind: 'problem', code: 'not_ready', notReady: (error.notReady ?? []).map(p => p.name) }
  return { kind: 'problem', code: 'other', refusal: error ?? { error: 'Could not start the game' } }
}

export async function startGame(lobbyId: string, opts: { force?: boolean } = {}): Promise<StartOutcome> {
  const req = { params: { path: { id: lobbyId } }, body: opts.force ? { force: true } : {} }
  const res = await api.POST('/api/lobbies/{id}/start', req)
  return startOutcome(res.data, res.error)
}

/**
 * Go to the lobby's game: only when it just started (the previous snapshot had none) and
 * you play in it. `prev` is undefined before the first snapshot, so opening the lobby page
 * (or coming back from the game) never bounces you into it.
 */
export function shouldOpenGame(prev: string | null | undefined, next: string | null, playing: boolean): boolean {
  return prev === null && next !== null && playing
}

export type GameSelection = { mode: string; config: Record<string, unknown> }

/**
 * What the Play page's form starts with for the host of a lobby: the lobby's saved next game, merged
 * over that mode's defaults so every field the form reads exists (a saved next game may set
 * only some of them), or the given fallback — the player's own
 * remembered mode and settings — when the lobby has no next game yet. Meant to be applied once,
 * the first time the lobby's next game becomes known (at mount, or once it arrives after), so
 * the host's later edits on the page are never overwritten by it.
 */
export function initialGameSelection(
  nextGame: { gameId: string; config: Record<string, unknown> } | null,
  fallback: GameSelection,
  defaultsFor: (mode: string) => Record<string, unknown> | undefined,
): GameSelection {
  if (!nextGame) return fallback
  return { mode: nextGame.gameId, config: { ...(defaultsFor(nextGame.gameId) ?? {}), ...nextGame.config } }
}
