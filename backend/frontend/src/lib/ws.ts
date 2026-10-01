import { writable } from 'svelte/store'
import { WsCloseCode, type ClientMessage, type Snapshot, type UserAction } from './api/game-ws'
import { SnapshotSchema } from './api/zod'

export type { Snapshot }

/**
 * A snapshot from the server, parsed against schema/game-ws-v1.json (unknown fields
 * stripped), or null. A snapshot that doesn't parse is dropped with a warning: the page
 * keeps its last good one (a stale tab after a deploy; reloading fixes it).
 */
export function parseSnapshot(m: unknown): Snapshot | null {
  const r = SnapshotSchema.safeParse(m)
  if (r.success) return r.data
  if (typeof m === 'object' && m !== null && 'type' in m && m.type === 'snapshot') {
    console.warn('Ignoring a snapshot that does not match the schema', r.error.issues)
  }
  return null
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
        const msg = parseSnapshot(JSON.parse(e.data))
        if (msg) { snapshot.set(msg); backoff = 500 }
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
