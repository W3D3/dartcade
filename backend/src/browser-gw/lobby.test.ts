import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import { WsCloseCode } from '../schema/game-ws.js'
import { LobbyHub } from '../lobby/hub.js'
import { lobbyGwPlugin } from './lobby.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))
import { getAuthUser } from '../auth/session.js'

let app: FastifyInstance | null = null
afterEach(async () => { await app?.close(); app = null; vi.mocked(getAuthUser).mockReset().mockResolvedValue(null) })

async function serve(lobbies: unknown, hub: LobbyHub, friends: unknown = {}): Promise<number> {
  app = Fastify()
  await app.register(fastifyWebsocket)
  await app.register(lobbyGwPlugin, { lobbies: lobbies as any, hub, friends: friends as any })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return (app.server.address() as AddressInfo).port
}

const closeCode = (url: string) => new Promise<number>((resolve, reject) => {
  const ws = new WebSocket(url)
  ws.addEventListener('close', e => { resolve((e as any).code) })
  setTimeout(() => reject(new Error('timeout')), 2000)
})
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise(r => setTimeout(r, 10))
}

describe('/ws/lobby', () => {
  it('closes for the signed out, without a lobby id, for an unknown lobby and for non-members', async () => {
    const lobbyAccess = vi.fn((lobbyId: string) => Promise.resolve(lobbyId === 'gone' ? 'not_found' : 'forbidden'))
    const port = await serve({ lobbyAccess, refreshPresence: vi.fn() }, new LobbyHub())
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)).toBe(WsCloseCode.Unauthorized)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'max' })
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby`)).toBe(WsCloseCode.MissingSession)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=gone`)).toBe(WsCloseCode.NotFound)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)).toBe(WsCloseCode.Forbidden)
  })

  it('a member gets the lobby and counts as online until the socket closes', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'chris' })
    const hub = new LobbyHub()
    const refreshPresence = vi.fn((lobbyId: string) => {
      hub.sendLobby(lobbyId, { type: 'lobby_closed', lobbyId })   // any message: the service builds the real one
      return Promise.resolve()
    })
    const port = await serve({ lobbyAccess: vi.fn().mockResolvedValue('ok'), refreshPresence }, hub)
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => { resolve() }, { once: true })
      setTimeout(() => reject(new Error('no message')), 2000)
    })
    expect(hub.online('l1')).toEqual(new Set(['chris']))
    ws.close()
    await until(() => refreshPresence.mock.calls.length >= 2)
    expect(hub.online('l1')).toEqual(new Set())
  })
})

describe('/ws/me', () => {
  const friendsMsg = { type: 'friends', friends: [], incoming: [], outgoing: [] }
  const fakeFriends = () => ({ message: vi.fn().mockResolvedValue(friendsMsg), connected: vi.fn(), disconnected: vi.fn() })
  const messages = (ws: WebSocket, n: number) => new Promise<unknown[]>((resolve, reject) => {
    const got: unknown[] = []
    ws.addEventListener('message', e => { got.push(JSON.parse(String(e.data))); if (got.length === n) resolve(got) })
    setTimeout(() => reject(new Error('no message')), 2000)
  })

  it('closes for the signed out; sends the user\'s state and friends when it opens', async () => {
    const hub = new LobbyHub()
    const me = { type: 'me', invites: [], lobby: null }
    const friends = fakeFriends()
    const port = await serve({ meMessage: vi.fn().mockResolvedValue(me) }, hub, friends)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/me`)).toBe(WsCloseCode.Unauthorized)
    expect(friends.connected).not.toHaveBeenCalled()
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'lena' })
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/me`)
    expect(await messages(ws, 2)).toEqual([me, friendsMsg])
    expect(hub.hasMe('lena')).toBe(true)
    expect(friends.connected).toHaveBeenCalledWith('lena')
    ws.close()
    await until(() => friends.disconnected.mock.calls.length > 0)
    expect(hub.hasMe('lena')).toBe(false)
    expect(friends.disconnected).toHaveBeenCalledWith('lena')
  })

  it('counts each socket once: two tabs open, one closes', async () => {
    const hub = new LobbyHub()
    const friends = fakeFriends()
    const port = await serve({ meMessage: vi.fn().mockResolvedValue({ type: 'me', invites: [], lobby: null }) }, hub, friends)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'lena' })
    const a = new WebSocket(`ws://127.0.0.1:${port}/ws/me`)
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws/me`)
    await Promise.all([messages(a, 2), messages(b, 2)])
    expect(friends.connected).toHaveBeenCalledTimes(2)
    a.close()
    await until(() => friends.disconnected.mock.calls.length > 0)
    expect(friends.disconnected).toHaveBeenCalledTimes(1)
    expect(hub.hasMe('lena')).toBe(true)
    b.close()
    await until(() => friends.disconnected.mock.calls.length > 1)
    expect(friends.disconnected).toHaveBeenCalledTimes(2)
  })
})
