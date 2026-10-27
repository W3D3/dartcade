import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import { WsCloseCode } from '../schema/game-ws.js'
import { BigScreenService } from '../bigscreen/service.js'
import { hashBoardToken } from '../boards/token.js'
import { bigScreenGwPlugin } from './bigScreen.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))
vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn(), getBoardByBigScreenTokenHash: vi.fn() }))
vi.mock('../flags/index.js', () => ({ flagEnabled: vi.fn().mockResolvedValue(true), loadFlagUser: vi.fn((_db, id: string) => id) }))
import { getAuthUser } from '../auth/session.js'
import { getBoardById, getBoardByBigScreenTokenHash } from '../db/queries.js'
import { flagEnabled } from '../flags/index.js'

const boards: Partial<Record<string, { id: string; owner_user_id: string }>> = {
  A: { id: 'A', owner_user_id: 'owner' },
  B: { id: 'B', owner_user_id: 'owner' },
}
let active: Record<string, string | undefined> = {}
let app: FastifyInstance | null = null
let service: BigScreenService | null = null

afterEach(async () => {
  service?.close()
  await app?.close()
  app = null
  vi.mocked(getAuthUser).mockReset().mockResolvedValue(null)
  vi.mocked(flagEnabled).mockReset().mockResolvedValue(true)
  active = {}
})

async function serve(): Promise<number> {
  vi.mocked(getBoardById).mockImplementation(((_db: unknown, id: string) => Promise.resolve(boards[id])) as any)
  vi.mocked(getBoardByBigScreenTokenHash).mockImplementation(((_db: unknown, hash: string) =>
    Promise.resolve(hash === hashBoardToken('good-a') ? boards.A : undefined)) as any)
  service = new BigScreenService({
    activeOn: id => active[id],
    getSnapshot: id => ({ id }) as never,
    loadBoard: id => Promise.resolve(boards[id] ? { name: `Board ${id}`, prefs: {} } : undefined),
    isOnline: () => true,
    now: Date.now,
    setTimer: setTimeout,
    warn: () => undefined,
  })
  app = Fastify()
  await app.register(fastifyWebsocket)
  await app.register(bigScreenGwPlugin, { db: {} as any, service, authTimeoutMs: 100 })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return (app.server.address() as AddressInfo).port
}

const closeCode = (ws: WebSocket) =>
  new Promise<number>((resolve, reject) => {
    ws.addEventListener('close', e => {
      resolve((e as any).code)
    })
    setTimeout(() => reject(new Error('timeout')), 2000)
  })
const nextMessage = (ws: WebSocket) =>
  new Promise<any>((resolve, reject) => {
    ws.addEventListener(
      'message',
      (e: MessageEvent) => {
        resolve(JSON.parse(String(e.data)))
      },
      { once: true },
    )
    setTimeout(() => reject(new Error('no message')), 2000)
  })
const auth = (ws: WebSocket, token: string) => {
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }))
  })
}

describe('/ws/board', () => {
  it('lets the owner in by cookie and sends an idle screen', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    const m = await nextMessage(ws)
    expect(m).toMatchObject({ type: 'big_screen', board: { id: 'A', name: 'Board A' }, screen: { kind: 'idle' } })
    ws.close()
  })

  it('closes a non-owner without a token as unauthorized and an unknown board as not found', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'other', impersonatedBy: null })
    const port = await serve()
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`))).toBe(WsCloseCode.Unauthorized)
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=nope`))).toBe(WsCloseCode.NotFound)
  })

  it('lets a signed-in non-owner in with the board token', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'other', impersonatedBy: null })
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    auth(ws, 'good-a')
    expect((await nextMessage(ws)).board.id).toBe('A')
    ws.close()
  })

  it('closes a signed-in non-owner without a token as unauthorized after the timeout', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'other', impersonatedBy: null })
    const port = await serve()
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`))).toBe(WsCloseCode.Unauthorized)
  })

  it('lets the owner in without a token and not time out later', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    await nextMessage(ws)
    await new Promise(r => setTimeout(r, 200))
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('revoke closes a token socket with 4403 and leaves the owner socket open', async () => {
    const port = await serve()
    const kiosk = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    auth(kiosk, 'good-a')
    await nextMessage(kiosk)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    const owner = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    await nextMessage(owner)
    service!.revoke('A')
    expect(await closeCode(kiosk)).toBe(WsCloseCode.Forbidden)
    expect(owner.readyState).toBe(WebSocket.OPEN)
    owner.close()
  })

  it('takes a token as the first message for its own board', async () => {
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    auth(ws, 'good-a')
    expect((await nextMessage(ws)).board.id).toBe('A')
    ws.close()
  })

  it('closes a token used on another board', async () => {
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=B`)
    auth(ws, 'good-a')
    expect(await closeCode(ws)).toBe(WsCloseCode.Forbidden)
  })

  it('closes an unknown or revoked token', async () => {
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    auth(ws, 'revoked')
    expect(await closeCode(ws)).toBe(WsCloseCode.Unauthorized)
  })

  it('never takes a token from the query string', async () => {
    const port = await serve()
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A&token=good-a`))).toBe(WsCloseCode.Forbidden)
  })

  it('closes a socket that sends no auth message in time', async () => {
    const port = await serve()
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`))).toBe(WsCloseCode.Unauthorized)
  })

  it('closes when the flag is off for the board owner, on both paths', async () => {
    vi.mocked(flagEnabled).mockResolvedValue(false)
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    auth(ws, 'good-a')
    expect(await closeCode(ws)).toBe(WsCloseCode.Forbidden)
    expect(flagEnabled).toHaveBeenCalledWith('bigscreen.enabled', 'owner')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    expect(await closeCode(new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`))).toBe(WsCloseCode.Forbidden)
  })

  it('delivers a game that starts to the open socket', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    await nextMessage(ws)
    active = { A: 's1' }
    const next = nextMessage(ws)
    service!.onSessionChanged('s1')
    expect((await next).screen).toEqual({ kind: 'game', snapshot: { id: 's1' } })
    ws.close()
  })

  it('closes with not found when the board is deleted under a subscriber', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'owner', impersonatedBy: null })
    const port = await serve()
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/board?boardId=A`)
    await nextMessage(ws)
    delete boards.A
    service!.onBoardPresence('A')
    expect(await closeCode(ws)).toBe(WsCloseCode.NotFound)
    boards.A = { id: 'A', owner_user_id: 'owner' }
  })
})
