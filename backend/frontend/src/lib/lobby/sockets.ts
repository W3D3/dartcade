// The two lobby sockets. /ws/lobby?lobbyId= pushes the whole lobby after every change (the
// lobby page). /ws/me pushes your pending invites and a summary of your lobby (the
// indicator and the invite badge, everywhere), and your friends list with their status.
// Both only push; changes go through REST.
import { writable, type Readable } from 'svelte/store'
import { WsCloseCode } from '../api/game-ws'
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
export type OpenSocket = (url: string) => WebSocket
const openWs: OpenSocket = url => new WebSocket(url)

function readJson(e: MessageEvent): unknown {
  if (typeof e.data !== 'string') return null
  try {
    return JSON.parse(e.data)
  } catch {
    return null
  }
}

export function createLobbyStore(lobbyId: string, open: OpenSocket = openWs) {
  const lobby = writable<Lobby | null>(null)
  const ended = writable<LobbyEnd | null>(null)
  let ws: WebSocket | null = null
  let stopped = false
  let backoff = 500

  function stop(reason: LobbyEnd | null) {
    stopped = true
    if (reason) ended.set(reason)
    ws?.close()
  }

  function connect() {
    if (stopped) return
    ws = open(`/ws/lobby?lobbyId=${encodeURIComponent(lobbyId)}`)
    ws.onmessage = e => {
      const msg = parseLobbyMessage(readJson(e))
      if (msg?.type === 'lobby') {
        lobby.set(msg.lobby)
        backoff = 500
      } else if (msg?.type === 'lobby_closed') stop('closed')
    }
    ws.onclose = e => {
      const code: string | undefined = WsCloseCode[e.code]
      if (code === 'Unauthorized') {
        stopped = true
        window.location.hash = '#/login'
        return
      }
      if (code === 'Forbidden') {
        stop('left')
        return
      }
      if (code === 'NotFound') {
        stop('closed')
        return
      }
      if (stopped) return
      setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }
    ws.onerror = () => ws?.close()
  }
  connect()

  return {
    lobby: { subscribe: lobby.subscribe } satisfies Readable<Lobby | null>,
    ended: { subscribe: ended.subscribe } satisfies Readable<LobbyEnd | null>,
    destroy: () => stop(null),
  }
}

export type MeState = { invites: PendingInvite[]; lobby: LobbySummary | null; game: ActiveGame | null; friends: FriendList | null }

/** The signed-in user's /ws/me; started once signed in, stopped on sign-out. */
export function createMeStore(open: OpenSocket = openWs) {
  const state = writable<MeState | null>(null)
  let ws: WebSocket | null = null
  let running = false
  let backoff = 500
  let retry: ReturnType<typeof setTimeout> | null = null

  function connect() {
    retry = null
    if (!running) return
    const socket = open('/ws/me')
    ws = socket
    socket.onmessage = e => {
      const msg = parseMeMessage(readJson(e))
      if (msg?.type === 'me') {
        state.update(s => ({ invites: msg.invites, lobby: msg.lobby, game: msg.game, friends: s?.friends ?? null }))
        backoff = 500
      } else if (msg?.type === 'friends') {
        const { type: _type, ...list } = msg
        state.update(s => ({ ...(s ?? { invites: [], lobby: null, game: null }), friends: list }))
      }
    }
    socket.onclose = e => {
      if (ws !== socket || !running) return
      if (WsCloseCode[e.code] === 'Unauthorized') {
        running = false
        return
      }
      retry = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, 30_000)
    }
    socket.onerror = () => socket.close()
  }

  return {
    subscribe: state.subscribe,
    /** False before start(), after stop(), and once the server signed you out (4401). */
    running: () => running,
    start() {
      if (running) return
      running = true
      backoff = 500
      connect()
    },
    stop() {
      running = false
      if (retry !== null) {
        clearTimeout(retry)
        retry = null
      }
      ws?.close()
      ws = null
      state.set(null)
    },
  }
}

/** The app's one /ws/me (App.svelte starts and stops it with the signed-in user). */
export const me = createMeStore()
