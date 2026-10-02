import type { Session, UserAction } from './types.js'

/** The seat whose turn it is (during a bull off: the bull off's thrower). */
export function currentSeat(session: Session): number {
  return session.module.getCurrentPlayer(session.currentState)
}

/** The host and everyone who controls a seat can see the game. */
export function canAccessSession(userId: string, session: Session): boolean {
  return isHost(userId, session) || session.seats.some(s => s.controllerUserId === userId)
}

/** The host started the game: starts the bull off, aborts. */
export function isHost(userId: string, session: Session): boolean {
  return session.ownerUserId === userId
}

/** Whether the user is a member of the lobby (LobbyService.isMember). */
export type IsLobbyMember = (lobbyId: string, userId: string) => Promise<boolean>

/** For callers without lobbies (tests, the local flow): nobody is a lobby member. */
export const noLobbies: IsLobbyMember = () => Promise.resolve(false)

/** Who may watch a game: its host and seat controllers and, for a lobby game, everyone in the lobby. */
export async function canWatchSession(userId: string, session: Session, isLobbyMember: IsLobbyMember): Promise<boolean> {
  if (canAccessSession(userId, session)) return true
  return session.lobbyId !== null && await isLobbyMember(session.lobbyId, userId)
}

// Actions on the turn in progress: only whoever controls the seat that's up
const SEAT_ACTIONS = new Set(['add_dart', 'undo_dart', 'takeout', 'correct_dart', 'bulloff_skip'])

/** The action as it may be applied (forfeit gets its seats), or null when the user may not send it. */
export function authorizeAction(session: Session, userId: string, action: UserAction): UserAction | null {
  if (SEAT_ACTIONS.has(action.type)) {
    return session.seats[currentSeat(session)].controllerUserId === userId ? action : null
  }
  if (action.type === 'forfeit') {
    const live = session.seats.flatMap((s, i) => session.forfeited.includes(i) ? [] : [{ s, i }])
    const mine = live.filter(x => x.s.controllerUserId === userId).map(x => x.i)
    // Nothing to give up, or nobody left to lose to
    if (mine.length === 0 || mine.length === live.length) return null
    return { type: 'forfeit', seats: mine }
  }
  // The bull off's start/rethrow and any game action decide for everyone: the host
  return isHost(userId, session) ? action : null
}
