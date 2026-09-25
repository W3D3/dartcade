import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'
import { BridgeConnections } from './connections.js'

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
    const conn1 = { ws: ws1, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: false }
    const conn2 = { ws: ws2, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: false }
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
    const conn = { ws, boardDbId: 'board-ulid-1', hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    bc.remove(conn)
    expect(bc.get('board-ulid-1')).toBeUndefined()
  })

  it('send transmits JSON to the socket', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardDbId: 'board-ulid-1', hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    bc.send('board-ulid-1', { command_id: 'c1', name: 'reset' })
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ command_id: 'c1', name: 'reset' }))
  })

  it('isOnline returns true for a registered board', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardDbId: null, hardwareBoardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: false }
    bc.add(conn)
    bc.register(conn, 'board-ulid-1')
    expect(bc.isOnline('board-ulid-1')).toBe(true)
    expect(bc.isOnline('other')).toBe(false)
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
