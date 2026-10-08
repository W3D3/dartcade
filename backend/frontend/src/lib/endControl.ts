import type { Snapshot } from './api/game-ws'

/**
 * Which end-of-game control the viewer gets, while the game is still active: the host ends
 * the game for everyone ('end'); a player with seats in the game leaves, forfeiting them
 * ('leave'); a watcher with no seats gets neither (null). The server decides what each action
 * may do (`backend/src/session/access.ts`); this only picks which control to show.
 */
export function endControl(snapshot: Snapshot | null, userId: string | null): 'end' | 'leave' | null {
  if (!snapshot) return null
  if (userId !== null && userId === snapshot.ownerUserId) return 'end'
  return snapshot.mySeats.length > 0 ? 'leave' : null
}

/**
 * What a refused Leave says: the server refuses it when you control every seat still in the
 * game (nobody left to lose to), so only the host can end it. The host's name is their seat's
 * player, when they have one.
 */
export function leaveRefused(snapshot: Snapshot | null): string {
  const seat = snapshot ? snapshot.seats.findIndex(s => s.userId !== null && s.userId === snapshot.ownerUserId) : -1
  const name = seat >= 0 ? snapshot?.players[seat]?.name : undefined
  return `Only ${name ?? 'the host'} can end this game.`
}

/** Where the match screen goes once you're done with a game: its lobby, or home for a game outside one. */
export function afterGameRoute(snapshot: Snapshot | null): '/lobby' | '/' {
  return snapshot !== null && snapshot.lobbyId !== null ? '/lobby' : '/'
}

export type WinAction = 'rematch' | 'lobby' | 'play'

/**
 * The win screen's buttons: the host of a lobby game gets Rematch (the same game, people and
 * settings again: the lobby keeps them after a game) and Back to lobby; anyone else in a lobby
 * game Back to lobby; a game outside a lobby Back to Play.
 */
export function winActions(snapshot: Snapshot | null, userId: string | null): { primary: WinAction; secondary: WinAction | null } {
  if (afterGameRoute(snapshot) === '/') return { primary: 'play', secondary: null }
  if (userId !== null && userId === snapshot?.ownerUserId) return { primary: 'rematch', secondary: 'lobby' }
  return { primary: 'lobby', secondary: null }
}
