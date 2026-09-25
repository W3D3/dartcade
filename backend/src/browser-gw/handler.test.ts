import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import { BrowserConnections } from './connections.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))

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

describe('WS auth', () => {
  let testApp: ReturnType<typeof Fastify> | null = null
  afterEach(async () => { await testApp?.close(); testApp = null })

  it('closes with 4401 when not authenticated', async () => {
    const engine = { getSnapshot: vi.fn().mockReturnValue(undefined), onUserAction: vi.fn() } as any
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as any).port

    const code = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=s1`)
      ws.addEventListener('close', (e) => resolve((e as any).code))
      ws.addEventListener('error', () => reject(new Error('ws error')))
      setTimeout(() => reject(new Error('timeout')), 2000)
    })

    expect(code).toBe(4401)
  })
})
