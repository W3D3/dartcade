import type { FriendStatus } from '../schema/lobby-ws.js'
import type { Session } from '../session/types.js'
import type { LobbyOfUser } from '../db/friends.js'

/** What the server knows about a friend. */
export type StatusFacts = { online: boolean; invisible: boolean; game: { gameId: string } | null; lobby: LobbyOfUser | null }

/**
 * What a viewer sees of a friend, first match wins (spec "Online status"). Lobby and game show
 * only while the friend is online: someone who left their solo lobby open and went away is offline.
 */
export function friendStatus(f: StatusFacts, viewerFriendIds: ReadonlySet<string>): FriendStatus {
  if (f.invisible || !f.online) return { kind: 'offline' }
  if (f.game) return { kind: 'playing', gameId: f.game.gameId }
  if (f.lobby) {
    const host = f.lobby.hostUserId
    const joinable = f.lobby.access === 'friends' && host !== null && viewerFriendIds.has(host)
    return { kind: 'lobby', lobbyId: f.lobby.id, lobbyName: f.lobby.name, joinable }
  }
  return { kind: 'online' }
}

/** The running game the user has a seat in (their own, or one they throw for); null otherwise. */
export function seatedGame(session: Session | undefined, userId: string): { gameId: string } | null {
  if (!session || session.status !== 'active') return null
  const seated = session.seats.some(s => s.userId === userId || s.controllerUserId === userId)
  return seated ? { gameId: session.module.id } : null
}
