import type { WebSocket } from 'ws'
import { BrowserConnections } from '../browser-gw/connections.js'
import type { FriendsMessage, LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'

/** Open lobby sockets (per lobby) and per-user sockets (/ws/me, per user). */
export class LobbyHub {
  private readonly lobbies = new BrowserConnections()
  private readonly users = new BrowserConnections()
  // What each user's /ws/me last got: an unchanged message isn't sent again
  private readonly lastMe = new Map<string, string>()
  private readonly lastFriends = new Map<string, string>()

  addLobbySocket(lobbyId: string, ws: WebSocket, userId: string): void {
    this.lobbies.add(lobbyId, ws, userId)
  }
  // Lobbies and /ws/me never ask when someone left: forget it right away
  removeLobbySocket(lobbyId: string, ws: WebSocket): void {
    this.lobbies.remove(lobbyId, ws)
    this.lobbies.forget(lobbyId)
  }

  /** Members with the lobby open: shown online, the others away. */
  online(lobbyId: string): Set<string> {
    return this.lobbies.connectedUsers(lobbyId)
  }

  sendLobby(lobbyId: string, msg: LobbyServerMessage): void {
    this.lobbies.pushEach(lobbyId, () => msg)
  }
  closeLobby(lobbyId: string, code: number, reason: string): void {
    this.lobbies.closeAll(lobbyId, code, reason)
  }
  closeLobbyFor(lobbyId: string, userId: string, code: number, reason: string): void {
    this.lobbies.closeAll(lobbyId, code, reason, userId)
  }

  /**
   * A /ws/me socket opened: it gets the user's current state and friends list right away.
   * The friends list is remembered only for the user's first socket: a later one may carry a
   * newer list than the open tabs have (a push still pending), so then the next push always goes out.
   */
  addMeSocket(userId: string, ws: WebSocket, first: MeMessage, friends: FriendsMessage): void {
    const firstSocket = !this.users.has(userId)
    this.users.add(userId, ws, userId)
    const payload = JSON.stringify(first)
    this.lastMe.set(userId, payload)
    ws.send(payload)
    const friendsPayload = JSON.stringify(friends)
    if (firstSocket) this.lastFriends.set(userId, friendsPayload)
    else this.lastFriends.delete(userId)
    ws.send(friendsPayload)
  }

  removeMeSocket(userId: string, ws: WebSocket): void {
    this.users.remove(userId, ws)
    this.users.forget(userId)
    if (!this.users.has(userId)) {
      this.lastMe.delete(userId)
      this.lastFriends.delete(userId)
    }
  }

  hasMe(userId: string): boolean {
    return this.users.has(userId)
  }

  /** Sends the user's /ws/me sockets their state, unless it's what they already have. */
  sendMe(userId: string, msg: MeMessage): void {
    const payload = JSON.stringify(msg)
    if (this.lastMe.get(userId) === payload) return
    this.lastMe.set(userId, payload)
    this.users.pushEach(userId, () => msg)
  }

  /** Sends the user's /ws/me sockets their friends list, unless it's what they already have. */
  sendFriends(userId: string, msg: FriendsMessage): void {
    if (!this.users.has(userId)) return
    const payload = JSON.stringify(msg)
    if (this.lastFriends.get(userId) === payload) return
    this.lastFriends.set(userId, payload)
    this.users.pushEach(userId, () => msg)
  }
}
