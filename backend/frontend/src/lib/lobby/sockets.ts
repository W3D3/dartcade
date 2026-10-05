// The two lobby sockets. /ws/lobby?lobbyId= pushes the whole lobby after every change (the
// lobby page). /ws/me pushes your pending invites and a summary of your lobby (the
// indicator and the invite badge, everywhere), and your friends list with their status.
// Both only push; changes go through REST.
import { writable, type Readable } from 'svelte/store'
import { WsCloseCode } from '../api/game-ws'
import { reconnectingSocket, type OpenSocket, type ReconnectingSocket } from '../reconnectingSocket'
import { LobbyServerMessageSchema, MeServerMessageSchema } from '../api/zod'
import type { ActiveGame, FriendsMessage, Lobby, LobbyServerMessage, LobbySummary, MeMessage, PendingInvite } from '../api/lobby-ws'

/** Your friends and friend requests (the friends message on /ws/me, GET /api/friends). */
export type FriendList = Omit<FriendsMessage, 'type'>

const isTyped = (m: unknown, ...types: string[]): boolean =>
  typeof m === 'object' && m !== null && 'type' in m && typeof m.type === 'string' && types.includes(m.type)

/** A lobby socket message parsed against schema/lobby-ws-v1.json, or null (warns for broken lobby messages). */
export function parseLobbyMessage(m: unknown): LobbyServerMessage | null {
  const r = LobbyServerMessageSchema.safeParse(m)
  if (r.success) return r.data
  if (isTyped(m, 'lobby', 'lobby_closed')) console.warn('Ignoring a lobby message that does not match the schema', r.error.issues)
  return null
}

export function parseMeMessage(m: unknown): MeMessage | FriendsMessage | null {
  const r = MeServerMessageSchema.safeParse(m)
  return r.success ? r.data : null
}

/** Why a lobby page's socket stopped for good: you're not in the lobby any more, or it closed. */
export type LobbyEnd = 'left' | 'closed'

export function createLobbyStore(lobbyId: string, open?: OpenSocket) {
  const lobby = writable<Lobby | null>(null)
  const ended = writable<LobbyEnd | null>(null)

  function stop(reason: LobbyEnd | null) {
    if (reason) ended.set(reason)
    socket.stop()
  }

  const socket = reconnectingSocket(
    `/ws/lobby?lobbyId=${encodeURIComponent(lobbyId)}`,
    {
      onMessage: data => {
        const msg = parseLobbyMessage(data)
        if (msg?.type === 'lobby') lobby.set(msg.lobby)
        else if (msg?.type === 'lobby_closed') stop('closed')
      },
      onClose: closeCode => {
        const code: string | undefined = WsCloseCode[closeCode]
        if (code === 'Unauthorized') {
          window.location.hash = '#/login'
          return 'stop'
        }
        if (code === 'Forbidden') {
          ended.set('left')
          return 'stop'
        }
        if (code === 'NotFound') {
          ended.set('closed')
          return 'stop'
        }
      },
    },
    open,
  )

  return {
    lobby: { subscribe: lobby.subscribe } satisfies Readable<Lobby | null>,
    ended: { subscribe: ended.subscribe } satisfies Readable<LobbyEnd | null>,
    destroy: () => stop(null),
  }
}

export type MeState = { invites: PendingInvite[]; lobby: LobbySummary | null; game: ActiveGame | null; friends: FriendList | null }

/** The signed-in user's /ws/me; started once signed in, stopped on sign-out. */
export function createMeStore(open?: OpenSocket) {
  const state = writable<MeState | null>(null)
  let socket: ReconnectingSocket | null = null
  const running = () => socket !== null && !socket.stopped

  return {
    subscribe: state.subscribe,
    /** False before start(), after stop(), and once the server signed you out (4401). */
    running,
    start() {
      if (running()) return
      socket = reconnectingSocket(
        '/ws/me',
        {
          onMessage: data => {
            const msg = parseMeMessage(data)
            if (msg?.type === 'me') {
              state.update(s => ({ invites: msg.invites, lobby: msg.lobby, game: msg.game, friends: s?.friends ?? null }))
            } else if (msg?.type === 'friends') {
              const { type: _type, ...list } = msg
              state.update(s => ({ ...(s ?? { invites: [], lobby: null, game: null }), friends: list }))
            }
          },
          onClose: code => (WsCloseCode[code] === 'Unauthorized' ? 'stop' : undefined),
        },
        open,
      )
    },
    stop() {
      socket?.stop()
      socket = null
      state.set(null)
    },
  }
}

/** The app's one /ws/me (App.svelte starts and stops it with the signed-in user). */
export const me = createMeStore()
