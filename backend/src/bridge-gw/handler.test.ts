import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { BridgeConnections } from './connections.js'

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
    const conn1 = { ws: ws1, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, bmUrl: null, helloReceived: false }
    const conn2 = { ws: ws2, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, bmUrl: null, helloReceived: false }
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
    const conn = { ws, boardDbId: 'board-ulid-1', hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, bmUrl: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    bc.remove(conn)
    expect(bc.get('board-ulid-1')).toBeUndefined()
  })

  it('send transmits JSON to the socket', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardDbId: 'board-ulid-1', hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, bmUrl: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    bc.send('board-ulid-1', { command_id: 'c1', name: 'reset' })
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ command_id: 'c1', name: 'reset' }))
  })

  it('isOnline returns true for a registered board', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, bmUrl: null, helloReceived: false }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    expect(bc.isOnline('board-ulid-1')).toBe(true)
    expect(bc.isOnline('other')).toBe(false)
  })

  it('bmUrl is accessible after registering a connection', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: '1.0.7', bmUrl: 'http://192.168.0.109:3180', helloReceived: true }
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
      new Promise(r => { resolveBoard = r }) as any,
    )
    const engine = { onBridgeEvent: vi.fn().mockResolvedValue(undefined) } as any
    const socket = new FakeSocket()

    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine })

    // hello sent immediately on connect — before auth resolves
    socket.emit('message', Buffer.from(JSON.stringify({
      kind: 'bridge.hello', data: { bridge_version: 'v0.4.2', bm_version: '1.0', bm_url: 'http://board' },
    })))
    await flush()

    // auth resolves after hello already arrived
    resolveBoard({ id: 'board-1', hardware_id: null })
    await flush(); await flush()

    // a real board event follows
    socket.emit('message', Buffer.from(JSON.stringify({
      v: 1, seq: 1, kind: 'bm.frame', bridge_id: 'br', boot_id: 'boot',
      recv_wall: new Date().toISOString(), data: {},
    })))
    await flush(); await flush()

    // hello was processed (not dropped) → no 4400, and the event was acked
    expect(socket.close).not.toHaveBeenCalledWith(4400, 'expected bridge.hello')
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ ack: 1 }))

    // both versions from the hello are kept on the connection
    const conn = bridgeConnections.get('board-1')
    expect(conn?.bridgeVersion).toBe('v0.4.2')
    expect(conn?.bmVersion).toBe('1.0')
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
  const envelope = { v: 1, seq: 7, kind: 'dart.detected', bridge_id: 'b', boot_id: 'o', recv_wall: '2026-10-01T10:00:00.123456789Z', board_id: 'hw', data: { a: 1 } }

  it('envelope accepts UTC and offset timestamps', () => {
    expect(parseEnvelope(envelope)?.seq).toBe(7)
    expect(parseEnvelope({ ...envelope, recv_wall: '2026-10-01T12:00:00+02:00' })?.seq).toBe(7)
  })

  it('envelope is null when a field the event is stored by is missing or wrong', () => {
    for (const bad of [{ ...envelope, v: 2 }, { ...envelope, seq: '7' }, { ...envelope, boot_id: undefined }, { ...envelope, recv_wall: 'yesterday' }, null, 'x']) {
      expect(parseEnvelope(bad)).toBeNull()
    }
  })

  it('envelope keeps data as sent and board_id optional', () => {
    const { board_id: _, ...noBoard } = envelope
    const env = parseEnvelope(noBoard)
    expect(env?.data).toEqual({ a: 1 })
    expect(env?.board_id).toBeUndefined()
  })

  it('hello keeps each valid field even when another is broken', () => {
    expect(parseHello({ bridge_version: '1.2', bm_version: 3, bm_url: 'http://bm' }))
      .toEqual({ bridgeVersion: '1.2', bmVersion: null, bmUrl: 'http://bm' })
    expect(parseHello(null)).toEqual({ bridgeVersion: null, bmVersion: null, bmUrl: null })
  })
})
