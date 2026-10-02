import type { WebSocket } from 'ws'

export class BrowserConnections {
  // Socket → the user it belongs to, per game
  private sessions: Map<string, Map<WebSocket, string>> = new Map()
  // When each user's last socket of a game closed, per game. Cleared when they open it
  // again; kept for the process's lifetime, like the engine's finished sessions.
  private closed: Map<string, Map<string, Date>> = new Map()

  add(sessionId: string, ws: WebSocket, userId: string): void {
    let m = this.sessions.get(sessionId)
    if (!m) { m = new Map(); this.sessions.set(sessionId, m) }
    m.set(ws, userId)
    this.closed.get(sessionId)?.delete(userId)
  }

  remove(sessionId: string, ws: WebSocket, at: Date = new Date()): void {
    const m = this.sessions.get(sessionId)
    const userId = m?.get(ws)
    if (!m || userId === undefined) return
    m.delete(ws)
    if (!hasUser(m, userId)) {
      let c = this.closed.get(sessionId)
      if (!c) { c = new Map(); this.closed.set(sessionId, c) }
      c.set(userId, at)
    }
    if (m.size === 0) this.sessions.delete(sessionId)
  }

  /** Users with the game open (on at least one socket). */
  connectedUsers(sessionId: string): Set<string> {
    return new Set(this.sessions.get(sessionId)?.values() ?? [])
  }

  /** When the user's last socket of the game closed; null while one is open, or if they never had one. */
  disconnectedAt(sessionId: string, userId: string): Date | null {
    const m = this.sessions.get(sessionId)
    if (m && hasUser(m, userId)) return null
    return this.closed.get(sessionId)?.get(userId) ?? null
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

  /** Whether any socket is open under this key. */
  has(key: string): boolean {
    return (this.sessions.get(key)?.size ?? 0) > 0
  }

  /** Closes and forgets the key's sockets (only the user's, when given). */
  closeAll(key: string, code: number, reason: string, userId?: string): void {
    const m = this.sessions.get(key)
    if (!m) return
    for (const [ws, owner] of [...m]) {
      if (userId !== undefined && owner !== userId) continue
      m.delete(ws)
      ws.close(code, reason)
    }
    if (m.size === 0) this.sessions.delete(key)
  }
}

function hasUser(m: Map<WebSocket, string>, userId: string): boolean {
  for (const u of m.values()) if (u === userId) return true
  return false
}
