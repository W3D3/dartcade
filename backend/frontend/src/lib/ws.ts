import { writable } from 'svelte/store'
import { WS_CLOSE } from '$shared/wsClose'

export type Snapshot = {
  type: 'snapshot'
  sessionId: string
  gameId: string
  boardId: string | null
  players: { name: string }[]
  game: Record<string, unknown>
  bmStatus: { status: string; running: boolean; event: string } | null
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
        const msg = JSON.parse(e.data)
        if (msg.type === 'snapshot') { snapshot.set(msg); backoff = 500 }
      } catch {}
    }
    ws.onclose = (e) => {
      if (e.code === WS_CLOSE.unauthorized) {
        window.location.hash = '#/login'
        return
      }
      // Not this user's session, or it no longer exists: retrying won't help
      if (e.code === WS_CLOSE.forbidden || e.code === WS_CLOSE.notFound) {
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

  function send(action: unknown) {
    ws?.send(JSON.stringify({ type: 'user_action', action }))
  }

  function destroy() {
    closed = true
    ws?.close()
  }

  return { snapshot, send, destroy }
}
