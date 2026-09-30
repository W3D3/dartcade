import { writable } from 'svelte/store'
import { WsCloseCode, type ClientMessage, type Snapshot, type UserAction } from './api/game-ws'

export type { Snapshot }

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
        const msg = JSON.parse(e.data)
        if (msg.type === 'snapshot') { snapshot.set(msg); backoff = 500 }
      } catch {}
    }
    ws.onclose = (e) => {
      if (e.code === WsCloseCode.Unauthorized) {
        window.location.hash = '#/login'
        return
      }
      // Not this user's session, or it no longer exists: retrying won't help
      if (e.code === WsCloseCode.Forbidden || e.code === WsCloseCode.NotFound) {
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
