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
  return session.lobbyId !== null && (await isLobbyMember(session.lobbyId, userId))
}

// Actions on the turn in progress: only whoever controls the seat that's up
const SEAT_ACTIONS = new Set(['add_dart', 'undo_dart', 'takeout', 'correct_dart', 'bulloff_skip'])

/** The action as it may be applied (forfeit gets its seats), or null when the user may not send it. */
export function authorizeAction(session: Session, userId: string, action: UserAction): UserAction | null {
  if (SEAT_ACTIONS.has(action.type)) {
    return session.seats[currentSeat(session)].controllerUserId === userId ? action : null
  }
  if (action.type === 'forfeit') {
    const live = session.seats.flatMap((s, i) => (session.forfeited.includes(i) ? [] : [{ s, i }]))
    const mine = live.filter(x => x.s.controllerUserId === userId).map(x => x.i)
    if (mine.length === 0) return null // Nothing to give up
    const teamOf = session.module.teamsOf?.(session.committedState) ?? session.seats.map((_, i) => i)
    // Nobody left to lose to: the sender's teams plus the already-forfeited teams cover every team
    const covered = new Set([...mine, ...session.forfeited].map(i => teamOf[i]))
    if (covered.size >= new Set(teamOf).size) return null
    return { type: 'forfeit', seats: mine }
  }
  // The bull off's start/rethrow and any game action decide for everyone: the host
  return isHost(userId, session) ? action : null
}
