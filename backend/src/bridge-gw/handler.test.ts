import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import type { AddressInfo } from 'net'
import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
// Node's own WebSocket can't send headers
import { WebSocket as WsClient } from 'ws'
import { BridgeConnections } from './connections.js'
import { CameraStills, MAX_STILL_BYTES } from '../camera/store.js'
import { LightsStore } from '../lights/store.js'
import { LobbyHub } from '../lobby/hub.js'

vi.mock('../db/queries.js', () => ({
  getBoardByTokenHash: vi.fn(),
  insertBridgeEvent: vi.fn().mockResolvedValue({ inserted: true }),
  updateBoardHardwareId: vi.fn().mockResolvedValue(undefined),
}))
import * as queries from '../db/queries.js'
import { handleBridgeConnection, bridgeConnections, parseEnvelope, parseHello, bridgeToken } from './handler.js'

describe('bridge-gw token auth', () => {
  it('SHA-256 of token produces consistent hash', () => {
    const token = 'dev-bridge-token'
    const hash1 = createHash('sha256').update(token).digest('hex')
    const hash2 = createHash('sha256').update(token).digest('hex')
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)
  })

  it('different tokens produce different hashes', () => {
    const h1 = createHash('sha256').update('token-a').digest('hex')
    const h2 = createHash('sha256').update('token-b').digest('hex')
    expect(h1).not.toBe(h2)
  })

  it('takes the token from the Authorization header, or the query an older bridge sends', () => {
    expect(bridgeToken('Bearer abc', {})).toBe('abc')
    expect(bridgeToken('Bearer abc', { token: 'old' })).toBe('abc')
    expect(bridgeToken(undefined, { token: 'old' })).toBe('old')
    expect(bridgeToken('Basic abc', {})).toBeUndefined()
    expect(bridgeToken(undefined, {})).toBeUndefined()
  })
})

describe('BridgeConnections', () => {
  it('register evicts existing connection for same boardDbId', () => {
    const bc = new BridgeConnections()
    const ws1 = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const ws2 = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn1 = {
      ws: ws1,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: false,
    }
    const conn2 = {
      ws: ws2,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: false,
    }
    bc.add(conn1)
    bc.register(conn1, 'board-ulid-1')
    bc.add(conn2)
    bc.register(conn2, 'board-ulid-1')
    expect(ws1.close).toHaveBeenCalledWith(1001, 'replaced by new connection')
    expect(bc.get('board-ulid-1')?.ws).toBe(ws2)
  })

  it('remove cleans up the connection', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = {
      ws,
      boardDbId: 'board-ulid-1',
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: true,
    }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    bc.remove(conn)
    expect(bc.get('board-ulid-1')).toBeUndefined()
  })

  it('a replaced connection closing late leaves the new one online', () => {
    const bc = new BridgeConnections()
    const mk = () => ({
      ws: { readyState: 1, close: vi.fn(), send: vi.fn() } as any,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: true,
    })
    const old = mk(),
      fresh = mk()
    bc.add(old)
    bc.register(old, 'board-ulid-1')
    bc.add(fresh)
    bc.register(fresh, 'board-ulid-1')
    // The old socket's close event arrives after the reconnect registered
    bc.remove(old)
    expect(bc.isOnline('board-ulid-1')).toBe(true)
    expect(bc.get('board-ulid-1')).toBe(fresh)
  })

  it('isOnline returns true for a registered board', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = {
      ws,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: false,
    }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    expect(bc.isOnline('board-ulid-1')).toBe(true)
    expect(bc.isOnline('other')).toBe(false)
  })

  it('bmUrl is accessible after registering a connection', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = {
      ws,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: '1.0.7',
      bmUrl: 'http://192.168.0.109:3180',
      helloReceived: true,
    }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    expect(bc.get('board-ulid-1')?.bmUrl).toBe('http://192.168.0.109:3180')
  })
})

describe('bridgeGwPlugin', () => {
  it("checks the token a bridge sends in the Authorization header, not the URL's", async () => {
    vi.mocked(queries.getBoardByTokenHash).mockClear().mockResolvedValue(undefined)
    const { bridgeGwPlugin } = await import('./handler.js')
    const app = Fastify()
    await app.register(fastifyWebsocket)
    await app.register(bridgeGwPlugin, { db: {} as any, engine: {} as any })
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = app.server.address() as AddressInfo
      const ws = new WsClient(`ws://127.0.0.1:${port}/bridge?token=old`, { headers: { authorization: 'Bearer s3cr3t' } })
      // An unknown token closes the socket
      await new Promise(resolve => ws.once('close', resolve))
      expect(vi.mocked(queries.getBoardByTokenHash).mock.calls.map(c => c[1])).toEqual([
        createHash('sha256').update('s3cr3t').digest('hex'),
      ])
    } finally {
      await app.close()
    }
  })

  it('exports bridgeConnections instance', async () => {
    const { bridgeConnections } = await import('./handler.js')
    expect(bridgeConnections).toBeDefined()
  })

  it('forwards the lights hooks from its opts to the connection it handles', async () => {
    vi.mocked(queries.getBoardByTokenHash)
      .mockClear()
      .mockResolvedValue({ id: 'board-plugin-1', hardware_id: null } as any)
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const onBridgeHello = vi.fn()
    const { bridgeGwPlugin } = await import('./handler.js')
    const app = Fastify()
    await app.register(fastifyWebsocket)
    await app.register(bridgeGwPlugin, { db: {} as any, engine, onBridgeHello })
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = app.server.address() as AddressInfo
      const ws = new WsClient(`ws://127.0.0.1:${port}/bridge`, { headers: { authorization: 'Bearer tok' } })
      await new Promise(resolve => ws.once('open', resolve))
      ws.send(JSON.stringify({ kind: 'bridge.hello', data: {} }))
      await new Promise(r => setTimeout(r, 200))
      expect(onBridgeHello).toHaveBeenCalledWith('board-plugin-1')
      ws.close()
    } finally {
      await app.close()
    }
  })
})

class FakeSocket extends EventEmitter {
  readonly OPEN = 1
  readyState = 1
  close = vi.fn()
  send = vi.fn()
}

const flush = () => new Promise(r => setImmediate(r))

describe('handleBridgeConnection', () => {
  it('a bridge that closes while its token is checked never shows the board online', async () => {
    let resolveBoard!: (b: any) => void
    vi.mocked(queries.getBoardByTokenHash).mockReturnValue(
      new Promise(r => {
        resolveBoard = r
      }) as any,
    )
    const presence = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine: {} as any, onBoardPresence: presence })
    socket.readyState = 3
    socket.emit('close')
    resolveBoard({ id: 'board-gone', hardware_id: null })
    await flush()
    expect(bridgeConnections.isOnline('board-gone')).toBe(false)
    expect(presence).not.toHaveBeenCalledWith('board-gone')
  })

  it('does not drop bridge.hello that arrives before the token lookup resolves', async () => {
    // getBoardByTokenHash stays pending so hello arrives during the auth window.
    let resolveBoard!: (b: any) => void
    vi.mocked(queries.getBoardByTokenHash).mockReturnValue(
      new Promise(r => {
        resolveBoard = r
      }) as any,
    )
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined) } as any
    const socket = new FakeSocket()

    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })

    // hello sent immediately on connect — before auth resolves
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          kind: 'bridge.hello',
          data: { bridge_version: 'v0.4.2', bm_version: '1.0', bm_url: 'http://board' },
        }),
      ),
    )
    await flush()

    // auth resolves after hello already arrived
    resolveBoard({ id: 'board-1', hardware_id: null })
    await flush()
    await flush()

    // a real board event follows
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          v: 1,
          seq: 1,
          kind: 'bm.frame',
          bridge_id: 'br',
          boot_id: 'boot',
          recv_wall: new Date().toISOString(),
          data: {},
        }),
      ),
    )
    await flush()
    await flush()

    // hello was processed (not dropped) → no 4400, and the event was acked
    expect(socket.close).not.toHaveBeenCalledWith(4400, 'expected bridge.hello')
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ ack: 1, boot_id: 'boot' }))

    // both versions from the hello are kept on the connection
    const conn = bridgeConnections.get('board-1')
    expect(conn?.bridgeVersion).toBe('v0.4.2')
    expect(conn?.bmVersion).toBe('1.0')
  })

  it('answers the bridge heartbeat ping with a pong, without a warning', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-3', hardware_id: null } as any)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined) } as any
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    // transport.go sends this every 20 s; any reply resets the bridge's 45 s read deadline
    socket.emit('message', Buffer.from(JSON.stringify({ ping: '1' })))
    await flush()
    await flush()

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ pong: '1' }))
    expect(warn).not.toHaveBeenCalled()
    expect(engine.onBridgeEvent).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns about an event whose envelope does not match the schema, and does not ack it', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-2', hardware_id: null } as any)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined) } as any
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          v: 1,
          seq: 5,
          kind: 'dart.detected',
          bridge_id: 'br',
          boot_id: 'boot',
          recv_wall: '',
          data: {},
        }),
      ),
    )
    await flush()
    await flush()

    // The next ack would silently cover it on the bridge side: the warning is the only trace
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('envelope'), expect.objectContaining({ kind: 'dart.detected', seq: 5 }))
    expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ ack: 5, boot_id: 'boot' }))
    warn.mockRestore()
  })

  it('closes the socket when storing an event fails, and acks nothing after it', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-11', hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockRejectedValueOnce(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })
    const event = (seq: number) =>
      Buffer.from(
        JSON.stringify({
          v: 1,
          seq,
          kind: 'dart.detected',
          bridge_id: 'br',
          boot_id: 'boot',
          recv_wall: new Date().toISOString(),
          data: {},
        }),
      )
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    socket.emit('message', event(1))
    socket.emit('message', event(2))
    for (let i = 0; i < 5; i++) await flush()

    // The bridge's acks are cumulative: acking 2 would drop the unstored 1 from its outbox
    expect(socket.close).toHaveBeenCalledWith(1011, expect.any(String))
    expect(socket.send).not.toHaveBeenCalled()
    expect(engine.onBridgeEvent).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('acks telemetry without storing it or passing it to the game', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-12', hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear()
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })
    const event = (seq: number, kind: string) =>
      Buffer.from(JSON.stringify({ v: 1, seq, kind, bridge_id: 'br', boot_id: 'boot', recv_wall: new Date().toISOString(), data: {} }))
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    socket.emit('message', event(1, 'bm.frame'))
    socket.emit('message', event(2, 'motion'))
    socket.emit('message', event(3, 'dart.detected'))
    for (let i = 0; i < 5; i++) await flush()

    expect(socket.send.mock.calls.map(c => c[0])).toEqual([1, 2, 3].map(ack => JSON.stringify({ ack, boot_id: 'boot' })))
    expect(vi.mocked(queries.insertBridgeEvent).mock.calls.map(c => c[1].kind)).toEqual(['dart.detected'])
    expect(engine.onBridgeEvent.mock.calls.map((c: unknown[]) => c[1])).toEqual(['dart.detected'])
  })

  it('tells the lobbies when a board comes online and when it drops', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-9', hardware_id: null } as any)
    const engine = { onBridgeEvent: vi.fn(), onBoardPresence: vi.fn() } as any
    const onBoardPresence = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, onBoardPresence })
    await flush()
    expect(onBoardPresence).toHaveBeenCalledWith('board-9')
    socket.emit('close')
    expect(onBoardPresence).toHaveBeenCalledTimes(2)
  })

  it('tells them once when the socket errors and then closes', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-10', hardware_id: null } as any)
    const engine = { onBridgeEvent: vi.fn(), onBoardPresence: vi.fn() } as any
    const onBoardPresence = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, onBoardPresence })
    await flush()
    socket.emit('error', new Error('reset'))
    socket.emit('close')
    expect(onBoardPresence).toHaveBeenCalledTimes(2)
    expect(engine.onBoardPresence).toHaveBeenCalledTimes(2)
  })

  it("tells the owner's /ws/me once the bridge said hello, and when it drops", async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-11', hardware_id: null, owner_user_id: 'chris' } as any)
    const hub = new LobbyHub()
    const me = { readyState: 1, send: vi.fn(), close: vi.fn() } as any
    hub.addMeSocket(
      'chris',
      me,
      { type: 'me', invites: [], lobby: null, game: null },
      { type: 'friends', friends: [], incoming: [], outgoing: [] },
    )
    me.send.mockClear()
    const socket = new FakeSocket()
    handleBridgeConnection(
      socket as any,
      { token: 'tok' },
      { db: {} as any, engine: { onBoardPresence: vi.fn() } as any, onBoardStatus: (u, b, o) => hub.sendBoardStatus(u, b, o) },
    )
    await flush()
    expect(me.send).not.toHaveBeenCalled()
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    await flush()
    socket.emit('close')
    expect(me.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string))).toEqual([
      { type: 'board.status', boardId: 'board-11', online: true },
      { type: 'board.status', boardId: 'board-11', online: false },
    ])
  })
})

describe('camera stills from the bridge', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const stillMsg = (cam: number, bytes: Buffer = jpeg) =>
    Buffer.from(
      JSON.stringify({
        kind: 'camera.still',
        data: { cam, captured_at: '2026-10-04T12:00:00Z', content_type: 'image/jpeg', data: bytes.toString('base64') },
      }),
    )
  async function connect(boardId: string) {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: boardId, hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear()
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const stills = new CameraStills()
    const onCameraStill = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, stills, onCameraStill })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    await flush()
    return { engine, stills, onCameraStill, socket }
  }

  it('keeps the still for its board and camera and tells the games, without storing or acking an event', async () => {
    const { engine, stills, onCameraStill, socket } = await connect('board-c1')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    socket.emit('message', stillMsg(2))
    await flush()
    await flush()

    const still = stills.get('board-c1', 2)
    expect(still?.bytes).toEqual(jpeg)
    expect(still?.contentType).toBe('image/jpeg')
    expect(still?.capturedAt).toBe('2026-10-04T12:00:00Z')
    expect(onCameraStill).toHaveBeenCalledWith('board-c1', 2, still?.version)
    expect(queries.insertBridgeEvent).not.toHaveBeenCalled()
    expect(engine.onBridgeEvent).not.toHaveBeenCalled()
    expect(socket.send).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("forgets the board's stills when its bridge drops", async () => {
    const { stills, socket } = await connect('board-c3')
    socket.emit('message', stillMsg(0))
    await flush()
    await flush()
    expect(stills.versions('board-c3')).toHaveLength(1)
    socket.emit('close')
    expect(stills.versions('board-c3')).toEqual([])
  })

  it('keeps the stills when an old connection of a board closes after its successor came', async () => {
    const first = await connect('board-c4')
    const stills = first.stills
    // The bridge reconnects: a new socket registers before the old one's close arrives
    const fresh = new FakeSocket()
    handleBridgeConnection(fresh as any, { token: 'tok' }, { db: {} as any, engine: first.engine, stills })
    await flush()
    fresh.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    fresh.emit('message', stillMsg(1))
    await flush()
    await flush()
    first.socket.emit('close')
    expect(stills.versions('board-c4').map(v => v.cam)).toEqual([1])
  })

  it('keeps the combined still as camera 3', async () => {
    const { stills, onCameraStill, socket } = await connect('board-c5')
    socket.emit('message', stillMsg(3))
    await flush()
    await flush()
    expect(stills.get('board-c5', 3)?.bytes).toEqual(jpeg)
    expect(onCameraStill).toHaveBeenCalledWith('board-c5', 3, stills.get('board-c5', 3)?.version)
  })

  it('drops a still over 1 MiB, and a malformed one', async () => {
    const { stills, onCameraStill, socket } = await connect('board-c2')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    socket.emit('message', stillMsg(0, Buffer.alloc(MAX_STILL_BYTES + 1, 0xff)))
    socket.emit('message', stillMsg(4))
    await flush()
    await flush()
    expect(stills.get('board-c2', 0)).toBeUndefined()
    expect(stills.versions('board-c2')).toEqual([])
    expect(onCameraStill).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('BridgeConnections event feed', () => {
  it('keeps only feed kinds and caps the buffer', () => {
    const bc = new BridgeConnections()
    bc.recordEvent('b1', { at: 't', kind: 'motion', data: {} })
    for (let i = 0; i < 60; i++) bc.recordEvent('b1', { at: String(i), kind: 'dart.detected', data: {} })
    const feed = bc.recentEvents('b1')
    expect(feed).toHaveLength(50)
    expect(feed[0].at).toBe('10')
    expect(feed.every(e => e.kind === 'dart.detected')).toBe(true)
    expect(bc.recentEvents('other')).toEqual([])
  })
})

describe('wled telemetry from the bridge', () => {
  async function connect(boardId: string) {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: boardId, hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear()
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const lights = new LightsStore()
    const onLightsFound = vi.fn()
    const onBridgeHello = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, lights, onLightsFound, onBridgeHello })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    await flush()
    return { engine, lights, onLightsFound, onBridgeHello, socket }
  }

  const device = (mac: string) => ({ mac, host: '192.168.1.80', name: 'WLED', leds: 144, version: '0.15.0', segments: 1 })

  it('calls onBridgeHello with the board id once hello is processed', async () => {
    const { onBridgeHello } = await connect('board-h1')
    expect(onBridgeHello).toHaveBeenCalledWith('board-h1')
  })

  it('a scan lands in the store and tells the lights service, without storing or acking an event', async () => {
    const { engine, lights, onLightsFound, socket } = await connect('board-w1')
    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ kind: 'wled.found', data: { devices: [device('aa')], scanned_at: '2026-10-18T12:00:00Z' } })),
    )
    await flush()
    await flush()

    expect(lights.found('board-w1').devices.map(d => d.mac)).toEqual(['aa'])
    expect(onLightsFound).toHaveBeenCalledWith('board-w1', [device('aa')])
    expect(queries.insertBridgeEvent).not.toHaveBeenCalled()
    expect(engine.onBridgeEvent).not.toHaveBeenCalled()
    expect(socket.send).not.toHaveBeenCalled()
  })

  it('a scan with a scan_error lands in the store', async () => {
    const { lights, socket } = await connect('board-w6')
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          kind: 'wled.found',
          data: { devices: [], scanned_at: '2026-10-18T12:00:00Z', scan_error: 'mdns browse failed' },
        }),
      ),
    )
    await flush()
    await flush()

    expect(lights.found('board-w6').scanError).toBe('mdns browse failed')
  })

  it('a probe reply records a failed probe', async () => {
    const { lights, socket } = await connect('board-w2')
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          kind: 'wled.found',
          data: { devices: [], scanned_at: '2026-10-18T12:00:00Z', probe_host: '192.168.1.90', probe_error: 'not a WLED device' },
        }),
      ),
    )
    await flush()
    await flush()

    expect(lights.found('board-w2').probe).toEqual({ host: '192.168.1.90', error: 'not a WLED device' })
  })

  it('drops an invalid wled.found payload silently', async () => {
    const { lights, onLightsFound, socket } = await connect('board-w3')
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'wled.found', data: { devices: 'nope' } })))
    await flush()
    await flush()

    expect(lights.found('board-w3').devices).toEqual([])
    expect(onLightsFound).not.toHaveBeenCalled()
  })

  it('a status report lands in the store', async () => {
    const { lights, socket } = await connect('board-w4')
    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ kind: 'wled.status', data: { device_id: 'aa', reachable: false, error: 'timeout' } })),
    )
    await flush()
    await flush()

    expect(lights.status('board-w4', 'aa')).toMatchObject({ reachable: false, error: 'timeout' })
  })

  it('drops an invalid wled.status payload silently', async () => {
    const { lights, socket } = await connect('board-w5')
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'wled.status', data: { reachable: 'not a boolean' } })))
    await flush()
    await flush()

    expect(lights.status('board-w5', 'aa')).toBeNull()
    expect(socket.send).not.toHaveBeenCalled()
  })

  it("a throwing onLightsFound doesn't close the socket or stop later messages", async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-w7', hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear()
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const lights = new LightsStore()
    const onLightsFound = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, lights, onLightsFound })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    await flush()
    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ kind: 'wled.found', data: { devices: [device('aa')], scanned_at: '2026-10-18T12:00:00Z' } })),
    )
    await flush()
    await flush()

    expect(onLightsFound).toHaveBeenCalledWith('board-w7', [device('aa')])
    expect(socket.close).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('lights hook failed', { hook: 'onLightsFound', boardId: 'board-w7' }, expect.any(Error))

    // the connection keeps processing later messages even though the hook keeps throwing
    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ kind: 'wled.found', data: { devices: [device('bb')], scanned_at: '2026-10-18T12:00:01Z' } })),
    )
    await flush()
    await flush()
    expect(lights.found('board-w7').devices.map(d => d.mac)).toEqual(['bb'])
    expect(socket.close).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('onBoardEvent after an event is applied to the game', () => {
  it('calls onBoardEvent with the board id and kind after the engine call', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-ev1', hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear().mockResolvedValue({ inserted: true, id: 'ev1' })
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const onBoardEvent = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, onBoardEvent })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          v: 1,
          seq: 1,
          kind: 'takeout.started',
          bridge_id: 'br',
          boot_id: 'boot',
          recv_wall: new Date().toISOString(),
          data: {},
        }),
      ),
    )
    await flush()
    await flush()

    expect(engine.onBridgeEvent).toHaveBeenCalledWith('board-ev1', 'takeout.started', {}, 'ev1')
    expect(onBoardEvent).toHaveBeenCalledWith('board-ev1', 'takeout.started', {})
  })

  it('forwards the event data (board.status) to onBoardEvent', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-ev2', hardware_id: null } as any)
    vi.mocked(queries.insertBridgeEvent).mockClear().mockResolvedValue({ inserted: true, id: 'ev2' })
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const onBoardEvent = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, onBoardEvent })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    const data = { status: 'Calibrating', event: 'Started', running: true, connected: true }
    socket.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          v: 1,
          seq: 1,
          kind: 'board.status',
          bridge_id: 'br',
          boot_id: 'boot',
          recv_wall: new Date().toISOString(),
          data,
        }),
      ),
    )
    await flush()
    await flush()

    expect(onBoardEvent).toHaveBeenCalledWith('board-ev2', 'board.status', data)
  })
})

describe('Board Manager calls through the bridge (bm.request / bm.response)', () => {
  async function connect(boardId: string) {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: boardId, hardware_id: null } as any)
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined), onBoardPresence: vi.fn() } as any
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bridge.hello', data: {} })))
    await flush()
    return socket
  }
  const sentRequest = (socket: FakeSocket) => JSON.parse(socket.send.mock.calls.at(-1)![0])
  const answer = async (socket: FakeSocket, data: object) => {
    socket.emit('message', Buffer.from(JSON.stringify({ kind: 'bm.response', data })))
    await flush()
    await flush()
  }

  it("sends the request and resolves with the bridge's answer", async () => {
    const socket = await connect('board-bm1')
    const pending = bridgeConnections.request('board-bm1', { op: 'start' }, 1000)
    const req = sentRequest(socket)
    expect(req).toMatchObject({ kind: 'bm.request', data: { op: 'start' } })
    await answer(socket, { id: req.data.id, status: 200 })
    await expect(pending).resolves.toEqual({ id: req.data.id, status: 200 })
  })

  it("ignores an answer from another board's bridge, and gives up after the timeout", async () => {
    const socket = await connect('board-bm2')
    const other = await connect('board-bm3')
    const pending = bridgeConnections.request('board-bm2', { op: 'state' }, 50)
    await answer(other, { id: sentRequest(socket).data.id, status: 200 })
    await expect(pending).resolves.toBeNull()
  })

  it('resolves null when the bridge drops before answering, or is not connected', async () => {
    const socket = await connect('board-bm4')
    const pending = bridgeConnections.request('board-bm4', { op: 'camera', cam: 0 }, 10_000)
    socket.emit('close')
    await expect(pending).resolves.toBeNull()
    await expect(bridgeConnections.request('board-none', { op: 'start' }, 10_000)).resolves.toBeNull()
  })
})

describe('BridgeConnections.send', () => {
  it('sends JSON to a bridge that said hello, false otherwise', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, OPEN: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = {
      ws,
      boardDbId: null,
      hardwareBoardId: null,
      bridgeId: null,
      bootId: null,
      bmVersion: null,
      bmUrl: null,
      helloReceived: false,
    }
    bc.add(conn)
    bc.register(conn, 'board-send-1')
    expect(bc.send('board-send-1', { kind: 'wled.apply' })).toBe(false)
    expect(ws.send).not.toHaveBeenCalled()

    conn.helloReceived = true
    expect(bc.send('board-send-1', { kind: 'wled.apply' })).toBe(true)
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ kind: 'wled.apply' }))

    expect(bc.send('unknown-board', { kind: 'wled.apply' })).toBe(false)
  })
})

describe('bridge message parsing', () => {
  const envelope = {
    v: 1,
    seq: 7,
    kind: 'dart.detected',
    bridge_id: 'b',
    boot_id: 'o',
    recv_wall: '2026-10-01T10:00:00.123456789Z',
    board_id: 'hw',
    data: { a: 1 },
  }

  it('envelope accepts UTC and offset timestamps', () => {
    expect(parseEnvelope(envelope)?.seq).toBe(7)
    expect(parseEnvelope({ ...envelope, recv_wall: '2026-10-01T12:00:00+02:00' })?.seq).toBe(7)
  })

  it('envelope is null when a field the event is stored by is missing or wrong', () => {
    // An event that still says which one it is gets a warning: it's never acked, so that's its only trace
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const bad of [
      { ...envelope, v: 2 },
      { ...envelope, seq: '7' },
      { ...envelope, boot_id: undefined },
      { ...envelope, recv_wall: 'yesterday' },
      null,
      'x',
    ]) {
      expect(parseEnvelope(bad)).toBeNull()
    }
    expect(warn).toHaveBeenCalledWith(
      'Ignoring a bridge event whose envelope does not match the schema',
      expect.objectContaining({ kind: 'dart.detected' }),
    )
    warn.mockRestore()
  })

  it('envelope keeps data as sent and board_id optional', () => {
    const { board_id: _, ...noBoard } = envelope
    const env = parseEnvelope(noBoard)
    expect(env?.data).toEqual({ a: 1 })
    expect(env?.board_id).toBeUndefined()
  })

  it('hello keeps each valid field even when another is broken', () => {
    expect(parseHello({ bridge_version: '1.2', bm_version: 3, bm_url: 'http://bm' })).toEqual({
      bridgeVersion: '1.2',
      bmVersion: null,
      bmUrl: 'http://bm',
    })
    expect(parseHello(null)).toEqual({ bridgeVersion: null, bmVersion: null, bmUrl: null })
  })

  it('hello keeps only the origin of the Board Manager URL', () => {
    for (const url of [
      'http://192.168.1.5:3180/api?x=1',
      'http://192.168.1.5:3180/#frag',
      'http://192.168.1.5:3180/some/path',
      'http://192.168.1.5:3180',
    ]) {
      expect(parseHello({ bm_url: url }).bmUrl).toBe('http://192.168.1.5:3180')
    }
    expect(parseHello({ bm_url: 'https://board.local' }).bmUrl).toBe('https://board.local')
  })

  it('hello refuses a Board Manager URL that is not http(s)', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'gopher://x', 'not a url', '']) {
      expect(parseHello({ bridge_version: '1.2', bm_url: url })).toEqual({ bridgeVersion: '1.2', bmVersion: null, bmUrl: null })
    }
  })
})
