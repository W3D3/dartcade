// Account deletion needs to leave lobbies and forfeit running games before better-auth removes
// the row (see options.ts's `user.deleteUser.beforeDelete`). index.ts wires the real cleanup
// once `lobbies` and `engine` exist; tests set their own.

import type { ActionResult } from '../session/engine.js'
import { authorizeAction } from '../session/access.js'
import type { Session, UserAction } from '../session/types.js'

export type AccountCleanup = (userId: string) => Promise<void>

/**
 * What a user's account deletion should do to a game they're part of. Asks `authorizeAction`
 * the same question a live forfeit would (so the two can never disagree): a live seat with
 * someone left to play forfeits it. Refused because nobody would be left to lose to (the last
 * live player or team) ends the game outright instead of sending a forfeit the engine would
 * refuse anyway. Refused because the user holds no live seat at all — the host running the
 * game for others, say, found only through `ownerUserId` — leaves it running, untouched.
 */
export function decideCleanupAction(session: Session, userId: string): 'forfeit' | 'abort' | 'none' {
  if (authorizeAction(session, userId, { type: 'forfeit' })) return 'forfeit'
  const hasLiveSeat = session.seats.some((s, i) => !session.forfeited.includes(i) && s.controllerUserId === userId)
  return hasLiveSeat ? 'abort' : 'none'
}

/** The slice of SessionEngine/LobbyService that `cleanUpAccount` needs, so it can be unit-tested
 *  against fakes and tested against the real services without the two drifting apart. */
export type CleanupDeps = {
  engine: {
    getSessionByUser(userId: string): Session | undefined
    onUserAction(sessionId: string, userId: string, action: UserAction): Promise<ActionResult>
    deleteSession(sessionId: string, abortedByUserId?: string | null): Promise<boolean>
  }
  lobbies: {
    current(userId: string): Promise<{ id: string } | null>
    leave(userId: string, lobbyId: string): Promise<void>
  }
}

/** Leaves the user's lobby and settles any game they're part of, before better-auth removes
 *  their row (see options.ts's `beforeDelete`). The one real implementation, wired in index.ts
 *  and exercised directly (not re-implemented) by lobby/service.test.ts. */
export async function cleanUpAccount(deps: CleanupDeps, userId: string): Promise<void> {
  const lobby = await deps.lobbies.current(userId)
  if (lobby) await deps.lobbies.leave(userId, lobby.id)
  const game = deps.engine.getSessionByUser(userId)
  if (game) {
    switch (decideCleanupAction(game, userId)) {
      case 'forfeit':
        await deps.engine.onUserAction(game.id, userId, { type: 'forfeit' })
        break
      case 'abort':
        await deps.engine.deleteSession(game.id, userId)
        break
      case 'none':
        break
    }
  }
}

let cleanup: AccountCleanup = async () => {}

export function setAccountCleanup(fn: AccountCleanup): void {
  cleanup = fn
}

/** No-op until `setAccountCleanup` runs. */
export function runAccountCleanup(userId: string): Promise<void> {
  return cleanup(userId)
}
