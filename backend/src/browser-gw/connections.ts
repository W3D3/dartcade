import type { WebSocket } from 'ws'

export class BrowserConnections {
  // Socket → the user it belongs to, per game
  private sessions: Map<string, Map<WebSocket, string>> = new Map()

  add(sessionId: string, ws: WebSocket, userId: string): void {
    let m = this.sessions.get(sessionId)
    if (!m) { m = new Map(); this.sessions.set(sessionId, m) }
    m.set(ws, userId)
  }

  remove(sessionId: string, ws: WebSocket): void {
    const m = this.sessions.get(sessionId)
    m?.delete(ws)
    if (m?.size === 0) this.sessions.delete(sessionId)
  }

  /** Users with the game open (on at least one socket). */
  connectedUsers(sessionId: string): Set<string> {
    return new Set(this.sessions.get(sessionId)?.values() ?? [])
  }

  /** Sends every open socket its own payload (null: nothing). */
  pushEach(sessionId: string, build: (userId: string) => unknown): void {
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      if (ws.readyState !== 1) continue
      const msg = build(userId)
      if (msg != null) ws.send(JSON.stringify(msg))
    }
  }

  sendTo(sessionId: string, userIds: string[], msg: unknown): void {
    const payload = JSON.stringify(msg)
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      if (userIds.includes(userId) && ws.readyState === 1) ws.send(payload)
    }
  }
}
