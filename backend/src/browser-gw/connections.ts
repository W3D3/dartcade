import type { WebSocket } from 'ws'
import type { Snapshot } from '../session/types.js'

export class BrowserConnections {
  private sessions: Map<string, Set<WebSocket>> = new Map()

  add(sessionId: string, ws: WebSocket): void {
    if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, new Set())
    this.sessions.get(sessionId)!.add(ws)
  }

  remove(sessionId: string, ws: WebSocket): void {
    this.sessions.get(sessionId)?.delete(ws)
  }

  push(sessionId: string, snap: Snapshot): void {
    const payload = JSON.stringify(snap)
    for (const ws of this.sessions.get(sessionId) ?? []) {
      if (ws.readyState === 1) ws.send(payload)
    }
  }
}
