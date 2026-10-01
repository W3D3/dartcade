import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import { BrowserConnections } from './connections.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { Snapshot } from '../session/types.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))

describe('BrowserConnections', () => {
  it('push sends snapshot JSON to all sockets for a sessionId', () => {
    const bc = new BrowserConnections()
    const ws1 = { readyState: 1, send: vi.fn() } as any
    const ws2 = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws1)
    bc.add('session-1', ws2)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', gameId: 'x01', boardId: null, players: [], game: {}, bmStatus: null } as unknown as Snapshot
    bc.push('session-1', snap)
    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(snap))
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(snap))
  })

  it('push to sender: sender also receives snapshot', () => {
    const bc = new BrowserConnections()
    const sender = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', sender)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', gameId: 'x01', boardId: null, players: [], game: {}, bmStatus: null } as unknown as Snapshot
    bc.push('session-1', snap)
    expect(sender.send).toHaveBeenCalledOnce()
  })

  it('remove cleans up the socket', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws)
    bc.remove('session-1', ws)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', gameId: 'x01', boardId: null, players: [], game: {}, bmStatus: null } as unknown as Snapshot
    bc.push('session-1', snap)
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('push skips closed sockets (readyState !== 1)', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 3, send: vi.fn() } as any
    bc.add('session-1', ws)
    const snap = { type: 'snapshot' as const, sessionId: 'session-1', gameId: 'x01', boardId: null, players: [], game: {}, bmStatus: null } as unknown as Snapshot
    bc.push('session-1', snap)
    expect(ws.send).not.toHaveBeenCalled()
  })
})

describe('WS auth', () => {
  let testApp: FastifyInstance | null = null
  afterEach(async () => { await testApp?.close(); testApp = null })

  it('closes with 4401 when not authenticated', async () => {
    const engine = { getSnapshot: vi.fn().mockReturnValue(undefined), onUserAction: vi.fn() } as any
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const code = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=s1`)
      ws.addEventListener('close', (e) => resolve((e as any).code))
      ws.addEventListener('error', () => reject(new Error('ws error')))
      setTimeout(() => reject(new Error('timeout')), 2000)
    })

    expect(code).toBe(WsCloseCode.Unauthorized)
  })

  it('closes with 4403 when the session belongs to another user', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValueOnce({ userId: 'user-1' })
    const engine = {
      getSession: vi.fn().mockReturnValue({ id: 's1', ownerUserId: 'user-2' }),
      getSnapshot: vi.fn().mockReturnValue({ type: 'snapshot' }),
      onUserAction: vi.fn(),
    } as any
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const code = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=s1`)
      ws.addEventListener('close', (e) => resolve((e as any).code))
      ws.addEventListener('error', () => reject(new Error('ws error')))
      setTimeout(() => reject(new Error('timeout')), 2000)
    })

    expect(code).toBe(WsCloseCode.Forbidden)
  })
})

describe('WS client messages', () => {
  let testApp: FastifyInstance | null = null
  afterEach(async () => { await testApp?.close(); testApp = null })

  it('ignores malformed messages without closing, then applies a valid action', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'user-1' })
    const { SessionEngine } = await import('../session/engine.js')
    const { atcModule } = await import('../games/atc.js')
    const store = {
      insertSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined),
      finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession: vi.fn().mockResolvedValue(undefined),
    }
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', atcModule.defaultConfig, [{ name: 'A' }])
    const onUserAction = vi.spyOn(engine, 'onUserAction')

    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
    let closed = false
    ws.addEventListener('close', () => { closed = true })
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => resolve(), { once: true })   // initial snapshot
      setTimeout(() => reject(new Error('no snapshot')), 2000)
    })

    ws.send('not json')
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'nuke' } }))
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'add_dart' } }))   // missing segment
    // a newer client adding fields is still understood
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'undo_dart', clientVersion: 2 }, sentAt: 1 }))
    await new Promise(r => setTimeout(r, 200))

    expect(closed).toBe(false)
    expect(onUserAction).toHaveBeenCalledTimes(1)
    expect(onUserAction).toHaveBeenCalledWith(sessionId, expect.objectContaining({ type: 'undo_dart' }))
    ws.close()
  })

  it('strips unknown fields from segment and the action before they reach the engine/snapshot', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'user-1' })
    const { SessionEngine } = await import('../session/engine.js')
    const { atcModule } = await import('../games/atc.js')
    const { checkSnapshot } = await import('../session/snapshotValidation.js')
    const store = {
      insertSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined),
      finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession: vi.fn().mockResolvedValue(undefined),
    }
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', atcModule.defaultConfig, [{ name: 'A' }])
    const onUserAction = vi.spyOn(engine, 'onUserAction')

    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => resolve(), { once: true })   // initial snapshot
      setTimeout(() => reject(new Error('no snapshot')), 2000)
    })

    ws.send(JSON.stringify({
      type: 'user_action',
      action: {
        type: 'add_dart',
        segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1, extra: 1 },
        clientVersion: 2,
      },
    }))
    await new Promise(r => setTimeout(r, 200))

    expect(onUserAction).toHaveBeenCalledTimes(1)
    expect(onUserAction).toHaveBeenCalledWith(sessionId, {
      type: 'add_dart',
      segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 },
    })

    const snap = engine.getSnapshot(sessionId)!
    expect(() => checkSnapshot(snap, () => {})).not.toThrow()
    ws.close()
  })

  it('keeps coords (x, y only) on add_dart, dropping extra fields inside coords', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'user-1' })
    const { SessionEngine } = await import('../session/engine.js')
    const { atcModule } = await import('../games/atc.js')
    const store = {
      insertSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined),
      finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession: vi.fn().mockResolvedValue(undefined),
    }
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', atcModule.defaultConfig, [{ name: 'A' }])
    const onUserAction = vi.spyOn(engine, 'onUserAction')

    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => resolve(), { once: true })   // initial snapshot
      setTimeout(() => reject(new Error('no snapshot')), 2000)
    })

    ws.send(JSON.stringify({
      type: 'user_action',
      action: {
        type: 'add_dart',
        segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 },
        coords: { x: 0.1, y: -0.2, source: 'touch' },
      },
    }))
    await new Promise(r => setTimeout(r, 200))

    expect(onUserAction).toHaveBeenCalledTimes(1)
    expect(onUserAction).toHaveBeenCalledWith(sessionId, {
      type: 'add_dart',
      segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 },
      coords: { x: 0.1, y: -0.2 },
    })
    ws.close()
  })
})
