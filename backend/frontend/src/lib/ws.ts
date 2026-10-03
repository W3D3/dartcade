import { writable, type Readable } from 'svelte/store'
import { WsCloseCode, type ClientMessage, type ErrorMessage, type NoticeMessage, type Snapshot, type UserAction } from './api/game-ws'
import { ErrorMessageSchema, NoticeMessageSchema, SnapshotSchema } from './api/zod'

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

/** A transient notice from the server (a dart on your board out of turn), or null. Never warns. */
export function parseNotice(m: unknown): NoticeMessage | null {
  const r = NoticeMessageSchema.safeParse(m)
  return r.success ? r.data : null
}

/** An action of this viewer was refused by the server (e.g. a forfeit it couldn't apply), or null. */
export function parseError(m: unknown): ErrorMessage | null {
  const r = ErrorMessageSchema.safeParse(m)
  return r.success ? r.data : null
}

export function createSessionStore(sessionId: string) {
  const snapshot = writable<Snapshot | null>(null)
  const notice = writable<NoticeMessage | null>(null)
  const error = writable<ErrorMessage | null>(null)
  // The game socket is open (false while it reconnects)
  const connected = writable(false)
  let ws: WebSocket | null = null
  let closed = false
  let backoff = 500

  function connect() {
    if (closed) return
    ws = new WebSocket(`/ws?sessionId=${encodeURIComponent(sessionId)}`)
    ws.onopen = () => { connected.set(true) }
    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return
        const data: unknown = JSON.parse(e.data)
        const snap = parseSnapshot(data)
        if (snap) { snapshot.set(snap); backoff = 500; return }
        // Each notice is a new object, so subscribers hear the same notice twice in a row too
        const n = parseNotice(data)
        if (n) { notice.set(n); return }
        const err = parseError(data)
        if (err) error.set(err)
      } catch {}
    }
    ws.onclose = (e) => {
      connected.set(false)
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

  const noticeStore: Readable<NoticeMessage | null> = { subscribe: notice.subscribe }
  const errorStore: Readable<ErrorMessage | null> = { subscribe: error.subscribe }
  const connectedStore: Readable<boolean> = { subscribe: connected.subscribe }
  return { snapshot, notice: noticeStore, error: errorStore, connected: connectedStore, send, destroy }
}
