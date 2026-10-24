// What a ban does right away, once the ban is stored and the player's sessions are gone
// (db/adminUsers.ts banUser): their open sockets close, they leave their lobby and their running
// game is settled the way an account deletion settles it, and friends see them offline. Wired in
// app.ts; their boards' bridges stay connected (nobody signed in can use them).

import { WsCloseCode } from '../schema/game-ws.js'
import { cleanUpAccount, type CleanupDeps } from './cleanup.js'

export type BanDeps = CleanupDeps & {
  /** Closes every socket the user has open (/ws/me, lobby, game) with the given code */
  closeSockets(userId: string, code: number, reason: string): void
  /** Friends see the user offline now, not after the reconnect grace */
  goOffline(userId: string): void
}

export async function applyBan(deps: BanDeps, userId: string): Promise<void> {
  // Unauthorized: the browser stops reconnecting and goes to sign-in, where the ban is explained.
  // Closed first, so nothing more comes in from them while their lobby and game are settled.
  deps.closeSockets(userId, WsCloseCode.Unauthorized, 'banned')
  deps.goOffline(userId)
  await cleanUpAccount(deps, userId)
}
