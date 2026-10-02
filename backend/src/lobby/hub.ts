import type { WebSocket } from 'ws'
import { BrowserConnections } from '../browser-gw/connections.js'
import type { LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'

/** Open lobby sockets (per lobby) and per-user sockets (/ws/me, per user). */
export class LobbyHub {
  private readonly lobbies = new BrowserConnections()
  private readonly users = new BrowserConnections()
  // What each user's /ws/me last got: an unchanged message isn't sent again
  private readonly lastMe = new Map<string, string>()

  addLobbySocket(lobbyId: string, ws: WebSocket, userId: string): void { this.lobbies.add(lobbyId, ws, userId) }
  removeLobbySocket(lobbyId: string, ws: WebSocket): void { this.lobbies.remove(lobbyId, ws) }

  /** Members with the lobby open: shown online, the others away. */
  online(lobbyId: string): Set<string> { return this.lobbies.connectedUsers(lobbyId) }

  sendLobby(lobbyId: string, msg: LobbyServerMessage): void { this.lobbies.pushEach(lobbyId, () => msg) }
  closeLobby(lobbyId: string, code: number, reason: string): void { this.lobbies.closeAll(lobbyId, code, reason) }
  closeLobbyFor(lobbyId: string, userId: string, code: number, reason: string): void { this.lobbies.closeAll(lobbyId, code, reason, userId) }

  /** A /ws/me socket opened: it gets the user's current state right away. */
  addMeSocket(userId: string, ws: WebSocket, first: MeMessage): void {
    this.users.add(userId, ws, userId)
    const payload = JSON.stringify(first)
    this.lastMe.set(userId, payload)
    ws.send(payload)
  }

  removeMeSocket(userId: string, ws: WebSocket): void {
    this.users.remove(userId, ws)
    if (!this.users.has(userId)) this.lastMe.delete(userId)
  }

  hasMe(userId: string): boolean { return this.users.has(userId) }

  /** Sends the user's /ws/me sockets their state, unless it's what they already have. */
  sendMe(userId: string, msg: MeMessage): void {
    const payload = JSON.stringify(msg)
    if (this.lastMe.get(userId) === payload) return
    this.lastMe.set(userId, payload)
    this.users.pushEach(userId, () => msg)
  }
}
