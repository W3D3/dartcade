import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import { BrowserConnections } from './connections.js'
import { WsCloseCode } from '../schema/game-ws.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))

describe('BrowserConnections', () => {
  it('pushEach sends every socket of a game its payload', () => {
    const bc = new BrowserConnections()
    const ws1 = { readyState: 1, send: vi.fn() } as any
    const ws2 = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws1, 'u1')
    bc.add('session-1', ws2, 'u1')
    bc.pushEach('session-1', () => ({ type: 'snapshot' }))
    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'snapshot' }))
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'snapshot' }))
  })

  it('sends each socket its own payload', () => {
    const bc = new BrowserConnections()
    const a = { readyState: 1, send: vi.fn() } as any
    const b = { readyState: 1, send: vi.fn() } as any
    bc.add('s1', a, 'host'); bc.add('s1', b, 'lena')
    bc.pushEach('s1', userId => ({ for: userId }))
    expect(a.send).toHaveBeenCalledWith(JSON.stringify({ for: 'host' }))
    expect(b.send).toHaveBeenCalledWith(JSON.stringify({ for: 'lena' }))
    expect(bc.connectedUsers('s1')).toEqual(new Set(['host', 'lena']))
  })

  it('sends a message only to the named users', () => {
    const bc = new BrowserConnections()
    const a = { readyState: 1, send: vi.fn() } as any
    const b = { readyState: 1, send: vi.fn() } as any
    bc.add('s1', a, 'host'); bc.add('s1', b, 'lena')
    bc.sendTo('s1', ['lena'], { type: 'notice' })
    expect(a.send).not.toHaveBeenCalled()
    expect(b.send).toHaveBeenCalledOnce()
  })

  it('pushEach sends nothing when the payload is null', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 1, send: vi.fn() } as any
    bc.add('s1', ws, 'u1')
    bc.pushEach('s1', () => null)
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('remove cleans up the socket and its user', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 1, send: vi.fn() } as any
    bc.add('session-1', ws, 'u1')
    bc.remove('session-1', ws)
    bc.pushEach('session-1', () => ({ type: 'snapshot' }))
    expect(ws.send).not.toHaveBeenCalled()
    expect(bc.connectedUsers('session-1')).toEqual(new Set())
  })

  it('skips closed sockets (readyState !== 1)', () => {
    const bc = new BrowserConnections()
    const ws = { readyState: 3, send: vi.fn() } as any
    bc.add('session-1', ws, 'u1')
    bc.pushEach('session-1', () => ({ type: 'snapshot' }))
    bc.sendTo('session-1', ['u1'], { type: 'notice' })
    expect(ws.send).not.toHaveBeenCalled()
  })
})

describe('BrowserConnections: when a player left', () => {
  const at = new Date('2026-10-02T18:00:00.000Z')
  const sock = () => ({ readyState: 1, send: vi.fn() }) as any

  it('records when a user\'s last socket of the game closed', () => {
    const bc = new BrowserConnections()
    const ws = sock()
    bc.add('s1', ws, 'lena')
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
    bc.remove('s1', ws, at)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(at)
  })

  it('a user with another socket still open is not disconnected', () => {
    const bc = new BrowserConnections()
    const a = sock(); const b = sock()
    bc.add('s1', a, 'lena'); bc.add('s1', b, 'lena')
    bc.remove('s1', a, at)
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
    expect(bc.connectedUsers('s1')).toEqual(new Set(['lena']))
    const later = new Date('2026-10-02T18:05:00.000Z')
    bc.remove('s1', b, later)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(later)
  })

  it('opening the game again clears it', () => {
    const bc = new BrowserConnections()
    const ws = sock()
    bc.add('s1', ws, 'lena')
    bc.remove('s1', ws, at)
    bc.add('s1', sock(), 'lena')
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
  })

  it('knows nothing of a user who never opened the game', () => {
    expect(new BrowserConnections().disconnectedAt('s1', 'max')).toBeNull()
  })

  it('keeps the time per game', () => {
    const bc = new BrowserConnections()
    const one = sock(); const two = sock()
    bc.add('s1', one, 'lena'); bc.add('s2', two, 'lena')
    bc.remove('s1', one, at)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(at)
    expect(bc.disconnectedAt('s2', 'lena')).toBeNull()
  })

  it('ignores a socket it doesn\'t know', () => {
    const bc = new BrowserConnections()
    bc.remove('s1', sock(), at)
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
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
      getSession: vi.fn().mockReturnValue({ id: 's1', ownerUserId: 'user-2', seats: [] }),
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

  it('answers a refused action with an error', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'lena' })
    const { SessionEngine } = await import('../session/engine.js')
    const { x01Module } = await import('../games/x01.js')
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
    // The host's seat is up: Lena may watch, not take out
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'x01', config: x01Module.defaultConfig,
      seats: [
        { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: 'board-a', boardName: null },
        { name: 'Lena', userId: 'lena', controllerUserId: 'lena', boardId: 'board-b', boardName: null },
      ],
    })
    const onUserAction = vi.spyOn(engine, 'onUserAction')
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
    const messages: unknown[] = []
    ws.addEventListener('message', e => { messages.push(JSON.parse(String(e.data))) })
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => resolve(), { once: true })   // initial snapshot
      setTimeout(() => reject(new Error('no snapshot')), 2000)
    })
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'takeout' } }))
    await new Promise(r => setTimeout(r, 200))

    expect(onUserAction).toHaveBeenCalledWith(sessionId, 'lena', { type: 'takeout' })
    expect(messages).toContainEqual({ type: 'error', code: 'forbidden', action: 'takeout' })
    expect(store.appendEvent).not.toHaveBeenCalled()
    ws.close()
  })

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
    expect(onUserAction).toHaveBeenCalledWith(sessionId, 'user-1', expect.objectContaining({ type: 'undo_dart' }))
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
    expect(onUserAction).toHaveBeenCalledWith(sessionId, 'user-1', {
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
    expect(onUserAction).toHaveBeenCalledWith(sessionId, 'user-1', {
      type: 'add_dart',
      segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 },
      coords: { x: 0.1, y: -0.2 },
    })
    ws.close()
  })

  it('logs an action the engine fails to apply (e.g. the log write) and keeps the socket open', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'user-1' })
    const { SessionEngine } = await import('../session/engine.js')
    const { atcModule } = await import('../games/atc.js')
    const store = {
      insertSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]),
      appendEvent: vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined),
      finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession: vi.fn().mockResolvedValue(undefined),
    }
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', atcModule.defaultConfig, [{ name: 'A' }])
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    testApp = Fastify()
    const logError = vi.spyOn(testApp.log, 'error')
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

    const s1 = { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'add_dart', segment: s1 } }))   // append fails
    ws.send(JSON.stringify({ type: 'user_action', action: { type: 'add_dart', segment: s1 } }))   // applied
    await new Promise(r => setTimeout(r, 200))
    process.off('unhandledRejection', unhandled)

    expect(unhandled).not.toHaveBeenCalled()
    expect(closed).toBe(false)
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ sessionId }), 'user action not applied')
    expect(engine.getSession(sessionId)!.openDarts).toHaveLength(1)
    ws.close()
  })

  it('does not count a viewer whose socket closed before sign-in was checked', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    let signIn!: (u: { userId: string }) => void
    vi.mocked(getAuthUser).mockReturnValueOnce(new Promise(r => { signIn = r }) as any)
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
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin, browserConnections } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      setTimeout(() => reject(new Error('no open')), 2000)
    })
    ws.close()
    await new Promise(r => setTimeout(r, 200))
    signIn({ userId: 'user-1' })
    await new Promise(r => setTimeout(r, 100))

    expect(browserConnections.connectedUsers(sessionId)).toEqual(new Set())
  })
})
