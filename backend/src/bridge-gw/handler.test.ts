import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { BridgeConnections } from './connections.js'
import { CameraStills, MAX_STILL_BYTES } from '../camera/store.js'

vi.mock('../db/queries.js', () => ({
  getBoardByTokenHash: vi.fn(),
  insertBridgeEvent: vi.fn().mockResolvedValue({ inserted: true }),
  updateBoardHardwareId: vi.fn().mockResolvedValue(undefined),
}))
import * as queries from '../db/queries.js'
import { handleBridgeConnection, bridgeConnections, parseEnvelope, parseHello } from './handler.js'

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

  it('send transmits JSON to the socket', () => {
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
    bc.send('board-ulid-1', { command_id: 'c1', name: 'reset' })
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ command_id: 'c1', name: 'reset' }))
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

describe('bridgeGwPlugin export', () => {
  it('exports bridgeGwPlugin function', async () => {
    const { bridgeGwPlugin } = await import('./handler.js')
    expect(typeof bridgeGwPlugin).toBe('function')
  })

  it('exports bridgeConnections instance', async () => {
    const { bridgeConnections } = await import('./handler.js')
    expect(bridgeConnections).toBeDefined()
  })
})

class FakeSocket extends EventEmitter {
  readyState = 1
  close = vi.fn()
  send = vi.fn()
}

const flush = () => new Promise(r => setImmediate(r))

describe('handleBridgeConnection', () => {
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
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ ack: 1 }))

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
    expect(socket.send).not.toHaveBeenCalledWith(JSON.stringify({ ack: 5 }))
    warn.mockRestore()
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
