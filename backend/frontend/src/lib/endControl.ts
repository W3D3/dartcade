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
