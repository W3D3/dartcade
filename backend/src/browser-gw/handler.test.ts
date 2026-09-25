import { describe, it, expect, vi } from 'vitest'
import { BrowserConnections } from './connections.js'

describe('BrowserConnections', () => {
  it('push sends snapshot JSON to all sockets for a sessionId', () => {
    const bc = new BrowserConnections()
    const ws1 = { readyState: 1, send: vi.fn() } as any
    const ws2 = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws1)
    bc.add('session-1', ws2)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', players: [], game: {} }
    bc.push('session-1', snap)
    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(snap))
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(snap))
  })

  it('push to sender: sender also receives snapshot', () => {
    const bc = new BrowserConnections()
    const sender = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', sender)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', players: [], game: {} }
    bc.push('session-1', snap)
    expect(sender.send).toHaveBeenCalledOnce()
  })

  it('remove cleans up the socket', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws)
    bc.remove('session-1', ws)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', players: [], game: {} }
    bc.push('session-1', snap)
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('push skips closed sockets (readyState !== 1)', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 3, send: vi.fn() } as any
    bc.add('session-1', ws)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', players: [], game: {} }
    bc.push('session-1', snap)
    expect(ws.send).not.toHaveBeenCalled()
  })
})
