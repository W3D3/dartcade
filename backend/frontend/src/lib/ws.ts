import { writable } from 'svelte/store'

export type Snapshot = {
  type: 'snapshot'
  sessionId: string
  gameId: string
  players: { name: string }[]
  game: Record<string, unknown>
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
      if (e.code === 4401) {
        window.location.hash = '#/login'
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
