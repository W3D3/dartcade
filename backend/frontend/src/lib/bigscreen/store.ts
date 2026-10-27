// The big screen's socket: /ws/board pushes what to show. Unlike the game socket it never sends
// anyone to the login page; a kiosk has no session and proves itself with its token instead.
import { z } from 'zod'
import { writable, type Readable } from 'svelte/store'
import type { BigScreenMessage } from '$shared/bigScreen'
import { reconnectingSocket, type OpenSocket } from '../reconnectingSocket.js'
import { parseSnapshot, type Snapshot } from '../ws.js'
import type { GameDetail } from '../api'

const MessageSchema = z.object({
  type: z.literal('big_screen'),
  board: z.object({ id: z.string(), name: z.string(), online: z.boolean() }),
  prefs: z.record(z.string(), z.unknown()).catch({}),
  screen: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('idle') }),
    z.object({ kind: z.literal('game'), snapshot: z.unknown() }),
    z.object({ kind: z.literal('result'), snapshot: z.unknown(), until: z.number(), detail: z.unknown().optional() }),
  ]),
})

/** A message with its snapshot checked against the schema. */
export type BigScreenState = Omit<BigScreenMessage, 'screen'> & {
  screen:
    | { kind: 'idle' }
    | { kind: 'game'; snapshot: Snapshot }
    | { kind: 'result'; snapshot: Snapshot; until: number; detail?: GameDetail }
}

/** The saved game, if it has the shape the win views read (a stale tab or a bad one shows without it). */
function parseDetail(x: unknown): GameDetail | undefined {
  const d = x as Partial<GameDetail> | null | undefined
  return d && typeof d === 'object' && Array.isArray(d.game?.players) && Array.isArray(d.stats?.rows) && d.detail
    ? (d as GameDetail)
    : undefined
}

function parseMessage(data: unknown): BigScreenState | null {
  const r = MessageSchema.safeParse(data)
  if (!r.success) return null
  const { screen, ...base } = r.data
  if (screen.kind === 'idle') return { ...base, screen }
  // A snapshot this build cannot read (a stale tab) shows as idle rather than a broken page
  const snapshot = parseSnapshot(screen.snapshot)
  if (!snapshot) return { ...base, screen: { kind: 'idle' } }
  return {
    ...base,
    screen:
      screen.kind === 'game'
        ? { kind: 'game', snapshot }
        : { kind: 'result', snapshot, until: screen.until, detail: parseDetail(screen.detail) },
  }
}

export function createBigScreenStore(
  boardId: string,
  token: string | null,
  open?: OpenSocket,
): { message: Readable<BigScreenState | null>; connected: Readable<boolean>; destroy(): void } {
  const message = writable<BigScreenState | null>(null)
  const connected = writable(false)
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
      onClose: () => {
        connected.set(false)
        return undefined
      },
    },
    open,
  )
  return { message, connected, destroy: () => socket.stop() }
}
