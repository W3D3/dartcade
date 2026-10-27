// The big screen's socket: /ws/board pushes what to show. Unlike the game socket it never sends
// anyone to the login page; a kiosk has no session and proves itself with its token instead.
import { writable, type Readable } from 'svelte/store'
import { reconnectingSocket, type OpenSocket } from '../reconnectingSocket.js'
import type { Snapshot } from '../ws.js'
import { WsCloseCode } from '../api/game-ws.js'
import { BigScreenMessageSchema } from '../api/zod.js'
import type { BigScreenMessage } from '../api/board-ws.js'
import type { GameDetail } from '../api'

/** A message with the saved game of a result typed (the schema leaves it an open object). */
export type BigScreenState = Omit<BigScreenMessage, 'screen'> & {
  screen:
    | { kind: 'idle' }
    | { kind: 'game'; snapshot: Snapshot }
    | { kind: 'result'; snapshot: Snapshot; until: number; detail?: GameDetail }
}

function parseMessage(data: unknown): BigScreenState | null {
  const r = BigScreenMessageSchema.safeParse(data)
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the schema types the saved game of a result as an open object; it is a GameDetail
  if (r.success) return r.data as BigScreenState
  // A snapshot this build cannot read (a stale tab) shows as idle rather than a broken page
  const base = BigScreenMessageSchema.omit({ screen: true }).safeParse(data)
  return base.success ? { ...base.data, screen: { kind: 'idle' } } : null
}

export function createBigScreenStore(
  boardId: string,
  token: string | null,
  open?: OpenSocket,
): { message: Readable<BigScreenState | null>; connected: Readable<boolean>; stopped: Readable<boolean>; destroy(): void } {
  const message = writable<BigScreenState | null>(null)
  const connected = writable(false)
  const stopped = writable(false)
  const socket = reconnectingSocket(
    `/ws/board?boardId=${encodeURIComponent(boardId)}`,
    {
      onOpen: () => {
        connected.set(true)
        // The first message on every (re)open; the cookie path needs none
        if (token) socket.send(JSON.stringify({ type: 'auth', token }))
      },
      onMessage: data => {
        const m = parseMessage(data)
        if (m) message.set(m)
      },
      onClose: code => {
        connected.set(false)
        // The token was revoked or the board is gone: retrying won't help
        const name: string | undefined = WsCloseCode[code]
        if (name === 'Unauthorized' || name === 'Forbidden' || name === 'NotFound') {
          message.set(null)
          stopped.set(true)
          return 'stop'
        }
        return undefined
      },
    },
    open,
  )
  return { message, connected, stopped, destroy: () => socket.stop() }
}
