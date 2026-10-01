import { writable } from 'svelte/store'
import { WsCloseCode, type ClientMessage, type Snapshot, type UserAction } from './api/game-ws'

export type { Snapshot }

/** A snapshot from the server (shallow check; the backend validates the full shape against the schema). */
export function isSnapshot(m: unknown): m is Snapshot {
  return typeof m === 'object' && m !== null
    && 'type' in m && m.type === 'snapshot'
    && 'gameId' in m && typeof m.gameId === 'string'
    && 'game' in m && typeof m.game === 'object' && m.game !== null
    && 'players' in m && Array.isArray(m.players)
}

export function createSessionStore(sessionId: string) {
  const snapshot = writable<Snapshot | null>(null)
  let ws: WebSocket | null = null
  let closed = false
  let backoff = 500

  function connect() {
    if (closed) return
    ws = new WebSocket(`/ws?sessionId=${encodeURIComponent(sessionId)}`)
    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return
        const msg: unknown = JSON.parse(e.data)
        if (isSnapshot(msg)) { snapshot.set(msg); backoff = 500 }
      } catch {}
    }
    ws.onclose = (e) => {
      // The close code's name, when it is one of ours
      const code: string | undefined = WsCloseCode[e.code]
      if (code === 'Unauthorized') {
        window.location.hash = '#/login'
        return
      }
      // Not this user's session, or it no longer exists: retrying won't help
      if (code === 'Forbidden' || code === 'NotFound') {
        closed = true
        window.location.hash = '#/'
        return
      }
      if (!closed) setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }
    ws.onerror = () => ws?.close()
  }

  connect()

  function send(action: UserAction) {
    const msg: ClientMessage = { type: 'user_action', action }
    ws?.send(JSON.stringify(msg))
  }

  function destroy() {
    closed = true
    ws?.close()
  }

  return { snapshot, send, destroy }
}
