import { get, writable, type Readable } from 'svelte/store'
import {
  WsCloseCode,
  type CameraMessage,
  type ClientMessage,
  type ErrorMessage,
  type NoticeMessage,
  type Snapshot,
  type UserAction,
} from './api/game-ws'
import { CameraMessageSchema, ErrorMessageSchema, NoticeMessageSchema, SnapshotSchema } from './api/zod'
import { cameraKey, type CameraVersions } from './camera'
import { afterGameRoute } from './endControl'
import { reconnectingSocket } from './reconnectingSocket'

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

/** A board of the game has a new camera still, or null. Never warns. */
export function parseCamera(m: unknown): CameraMessage | null {
  const r = CameraMessageSchema.safeParse(m)
  return r.success ? r.data : null
}

export function createSessionStore(sessionId: string) {
  const snapshot = writable<Snapshot | null>(null)
  const notice = writable<NoticeMessage | null>(null)
  const error = writable<ErrorMessage | null>(null)
  // The newest camera still version per board and camera
  const cameras = writable<CameraVersions>({})
  // The game socket is open (false while it reconnects)
  const connected = writable(false)
  const socket = reconnectingSocket(`/ws?sessionId=${encodeURIComponent(sessionId)}`, {
    onOpen: () => connected.set(true),
    onMessage: data => {
      const snap = parseSnapshot(data)
      if (snap) {
        snapshot.set(snap)
        return
      }
      // Each notice is a new object, so subscribers hear the same notice twice in a row too
      const n = parseNotice(data)
      if (n) {
        notice.set(n)
        return
      }
      const err = parseError(data)
      if (err) {
        error.set(err)
        return
      }
      const cam = parseCamera(data)
      if (cam) {
        const key = cameraKey(cam.boardId, cam.cam)
        cameras.update(v => ((v[key] ?? 0) >= cam.version ? v : { ...v, [key]: cam.version }))
      }
    },
    onClose: closeCode => {
      connected.set(false)
      // The close code's name, when it is one of ours
      const code: string | undefined = WsCloseCode[closeCode]
      if (code === 'Unauthorized') {
        window.location.hash = '#/login'
        return 'stop'
      }
      // Not this user's session, or it no longer exists: retrying won't help. A successful
      // Leave or End already navigated away by the time this fires (a reconnect racing the
      // session's deletion): only follow it while this session's page is still showing.
      if (code === 'Forbidden' || code === 'NotFound') {
        if (/^#\/session\/([^/?]+)/.exec(window.location.hash)?.[1] === sessionId) {
          window.location.hash = `#${afterGameRoute(get(snapshot))}`
        }
        return 'stop'
      }
    },
  })

  function send(action: UserAction) {
    const msg: ClientMessage = { type: 'user_action', action }
    socket.send(JSON.stringify(msg))
  }

  function destroy() {
    socket.stop()
    connected.set(false)
  }

  const noticeStore: Readable<NoticeMessage | null> = { subscribe: notice.subscribe }
  const errorStore: Readable<ErrorMessage | null> = { subscribe: error.subscribe }
  const connectedStore: Readable<boolean> = { subscribe: connected.subscribe }
  const camerasStore: Readable<CameraVersions> = { subscribe: cameras.subscribe }
  return { snapshot, notice: noticeStore, error: errorStore, connected: connectedStore, cameras: camerasStore, send, destroy }
}
