// What the Watch page says about the game it follows. Pure, so the states are tested without a socket.
import type { Snapshot } from '$lib/ws'

/** The seats' names for "You are watching …": "Lena", "Lena vs Max". */
export function watchTitle(snapshot: Pick<Snapshot, 'players'>): string {
  return snapshot.players.map(p => p.name).join(' vs ')
}

/** Why the socket stopped for good (the close code's name, see createSessionStore). */
export type Stopped = string | null

/**
 * Where the page is: waiting for the first snapshot, live, offline (the socket dropped and reconnects),
 * over (the game ended: its result shows, then the page leaves), or unavailable (the server refused:
 * not your friend's game any more, the friend went Invisible, the game is gone) / full (too many watchers).
 */
export type WatchState = 'connecting' | 'live' | 'offline' | 'over' | 'unavailable' | 'full'

export function watchState(snapshot: Pick<Snapshot, 'status'> | null, connected: boolean, stopped: Stopped): WatchState {
  if (snapshot && snapshot.status !== 'active') return 'over'
  if (stopped === 'TooManyWatchers') return 'full'
  if (stopped) return 'unavailable'
  if (!snapshot) return 'connecting'
  return connected ? 'live' : 'offline'
}

/** How long the result shows before the page leaves. */
export const RESULT_SECONDS = 30

/** "5 watching" for the players; nothing while nobody watches. */
export function watchingLabel(n: number | undefined): string | null {
  return n && n > 0 ? `${n} watching` : null
}
