import { describe, it, expect, vi } from 'vitest'
import { checkSecret } from './handler.js'
import { BridgeConnections } from './connections.js'

describe('checkSecret', () => {
  it('returns true for matching secrets', () => {
    expect(checkSecret('correct', 'correct')).toBe(true)
  })

  it('returns false for wrong secret', () => {
    expect(checkSecret('wrong', 'correct')).toBe(false)
  })

  it('returns false for empty provided', () => {
    expect(checkSecret('', 'correct')).toBe(false)
  })

  it('returns false for empty expected', () => {
    expect(checkSecret('anything', '')).toBe(false)
  })
})

describe('BridgeConnections', () => {
  it('register evicts existing connection for same boardId', () => {
    const bc = new BridgeConnections()
    const ws1 = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const ws2 = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn1 = { ws: ws1, boardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: false }
    const conn2 = { ws: ws2, boardId: null, bridgeId: null, bootId: null, bmVersion: null, helloReceived: false }
    bc.add(conn1)
    bc.register(conn1, 'board-1')
    bc.add(conn2)
    bc.register(conn2, 'board-1')
    expect(ws1.close).toHaveBeenCalledWith(1001, 'replaced by new connection')
    expect(bc.get('board-1')?.ws).toBe(ws2)
  })

  it('remove cleans up the connection', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardId: 'board-1', bridgeId: null, bootId: null, bmVersion: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-1')
    bc.remove(conn)
    expect(bc.get('board-1')).toBeUndefined()
  })

  it('send transmits JSON to the socket', () => {
    const bc = new BridgeConnections()
    const ws = { readyState: 1, close: vi.fn(), send: vi.fn() } as any
    const conn = { ws, boardId: 'board-1', bridgeId: null, bootId: null, bmVersion: null, helloReceived: true }
    bc.add(conn)
    bc.register(conn, 'board-1')
    bc.send('board-1', { command_id: 'c1', name: 'reset' })
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ command_id: 'c1', name: 'reset' }))
  })
})
