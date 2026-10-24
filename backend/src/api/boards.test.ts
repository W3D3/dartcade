import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFastify } from './fastify.js'
import { boardsApiPlugin } from './boards.js'
import { CameraStills } from '../camera/store.js'
import type { Session } from '../session/types.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'user-1'
    done()
  }),
}))
const request = vi.hoisted(() => vi.fn())
vi.mock('../bridge-gw/connections.js', () => ({
  bridgeConnections: {
    isOnline: vi.fn().mockReturnValue(false),
    get: vi.fn().mockReturnValue(undefined),
    recentEvents: vi.fn().mockReturnValue([]),
    request,
  },
}))
vi.mock('../db/queries.js', () => ({
  getBoardsByOwner: vi.fn().mockResolvedValue([]),
  insertBoard: vi.fn().mockResolvedValue(undefined),
  getBoardById: vi.fn().mockResolvedValue(undefined),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  renameBoard: vi.fn().mockResolvedValue(undefined),
  hasActiveSessionOnBoard: vi.fn().mockResolvedValue(false),
}))

import * as queries from '../db/queries.js'
import * as connections from '../bridge-gw/connections.js'
import * as middleware from '../auth/middleware.js'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

function makeApp(
  opts: {
    stills?: CameraStills
    getSessionByBoard?: (boardId: string) => Session | undefined
    isLobbyMember?: (lobbyId: string, userId: string) => Promise<boolean>
    liveCameraTimeoutMs?: number
  } = {},
) {
  const app = createFastify()
  app.register(boardsApiPlugin, { db: {} as any, ...opts })
  return app
}

describe('GET /api/boards', () => {
  it('returns empty array when user has no boards', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards).toEqual([])
  })

  it('returns boards owned by user', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      {
        id: 'board-1',
        name: 'Living Room',
        hardware_id: null,
        created_at: new Date(),
        owner_user_id: 'user-1',
        token_hash: 'hash',
        lights_enabled: true,
      },
    ])
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards[0].id).toBe('board-1')
  })
})

describe('POST /api/boards', () => {
  it('returns 201 with id and token (never hash)', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards',
      payload: { name: 'Living Room' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeDefined()
    expect(body.token).toBeDefined()
    expect(body.token).not.toContain('hash')
    expect(body).not.toHaveProperty('token_hash')
    expect(queries.insertBoard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ owner_user_id: 'user-1', name: 'Living Room' }),
    )
  })

  it('returns 400 when name is missing', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards', payload: {} })
    expect(res.statusCode).toBe(400)
  })
})

describe('DELETE /api/boards/:id', () => {
  it('returns 404 when board not found', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/nope' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 when board owned by another user', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1',
      owner_user_id: 'other-user',
    } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(403)
  })

  it('returns 204 on successful delete', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1',
      owner_user_id: 'user-1',
    } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(204)
    expect(queries.deleteBoard).toHaveBeenCalledWith(expect.anything(), 'board-1')
  })

  it("forgets the deleted board's camera stills", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'board-1', owner_user_id: 'user-1' } as any)
    const stills = new CameraStills()
    stills.put('board-1', 0, { bytes: Buffer.from([0xff]), contentType: 'image/jpeg', capturedAt: '2026-10-04T12:00:00Z' })
    stills.put('board-2', 0, { bytes: Buffer.from([0xff]), contentType: 'image/jpeg', capturedAt: '2026-10-04T12:00:00Z' })
    const res = await makeApp({ stills }).inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(204)
    expect(stills.versions('board-1')).toEqual([])
    expect(stills.versions('board-2')).toHaveLength(1)
  })

  it('refuses to delete a board with a game running', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({
      id: 'board-1',
      owner_user_id: 'user-1',
    } as any)
    vi.mocked(queries.hasActiveSessionOnBoard).mockResolvedValueOnce(true)
    const app = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })
    expect(res.statusCode).toBe(409)
    expect(queries.deleteBoard).not.toHaveBeenCalled()
  })

  it('sends people on the board to Manual in their lobbies before deleting it', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'board-1', owner_user_id: 'user-1' } as any)
    const releaseBoard = vi.fn().mockResolvedValue(undefined)
    const app = createFastify()
    app.register(boardsApiPlugin, { db: {} as any, releaseBoard })
    expect((await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })).statusCode).toBe(204)
    expect(releaseBoard).toHaveBeenCalledWith('board-1')
    expect(releaseBoard.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(queries.deleteBoard).mock.invocationCallOrder[0])
  })
})

describe('GET /api/boards - bridgeVersion', () => {
  it('reports bridge and Board Manager versions separately', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      {
        id: 'board-1',
        name: 'Board',
        hardware_id: null,
        created_at: new Date(),
        owner_user_id: 'user-1',
        token_hash: 'hash',
        lights_enabled: true,
      },
    ])
    vi.mocked(connections.bridgeConnections).isOnline.mockReturnValue(true)
    vi.mocked(connections.bridgeConnections).get.mockReturnValue({
      bridgeVersion: 'v0.4.2',
      bmVersion: '1.0.7',
      bmUrl: 'http://192.168.0.109:3180',
    } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    const board = JSON.parse(res.body).boards[0]
    expect(board.bridgeVersion).toBe('v0.4.2')
    expect(board.bmVersion).toBe('1.0.7')
  })

  it('keeps the Board Manager port in bmUrl', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      {
        id: 'board-1',
        name: 'Board',
        hardware_id: null,
        created_at: new Date(),
        owner_user_id: 'user-1',
        token_hash: 'hash',
        lights_enabled: true,
      },
    ])
    vi.mocked(connections.bridgeConnections).get.mockReturnValue({ bmVersion: '1.0.7', bmUrl: 'http://192.168.0.109:3180' } as any)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    const board = JSON.parse(res.body).boards[0]
    expect(board.ip).toBe('192.168.0.109')
    expect(board.bmUrl).toBe('http://192.168.0.109:3180')
  })

  it('bridgeVersion is null when board is offline', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
      {
        id: 'board-1',
        name: 'Board',
        hardware_id: null,
        created_at: new Date(),
        owner_user_id: 'user-1',
        token_hash: 'hash',
        lights_enabled: true,
      },
    ])
    vi.mocked(connections.bridgeConnections).get.mockReturnValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards' })
    expect(JSON.parse(res.body).boards[0].bridgeVersion).toBeNull()
  })
})

describe('GET /api/boards/:id/camera/:index', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const put = (stills: CameraStills, cam = 0) =>
    stills.put('b1', cam, { bytes: jpeg, contentType: 'image/jpeg', capturedAt: '2026-10-04T12:00:00Z' })
  // A game on b1 that user-1 watches as a seat's controller, or as a member of its lobby
  const seated = { ownerUserId: 'host', seats: [{ controllerUserId: 'user-1' }], lobbyId: null } as unknown as Session
  const inLobby = { ownerUserId: 'host', seats: [{ controllerUserId: 'host' }], lobbyId: 'l1' } as unknown as Session

  it('returns 404 when board not found', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(undefined)
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/nope/camera/0' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 403 to someone who neither owns the board nor watches its game', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'other' } as any)
    const stills = new CameraStills()
    put(stills)
    const notMine = { ownerUserId: 'host', seats: [{ controllerUserId: 'host' }], lobbyId: 'l1' } as unknown as Session
    const res = await makeApp({ stills, getSessionByBoard: () => notMine, isLobbyMember: () => Promise.resolve(false) }).inject({
      method: 'GET',
      url: '/api/boards/b1/camera/0',
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 404 when the board has no still from that camera yet', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    const stills = new CameraStills()
    put(stills, 1)
    const res = await makeApp({ stills }).inject({ method: 'GET', url: '/api/boards/b1/camera/0' })
    expect(res.statusCode).toBe(404)
  })

  it('serves the owner the latest still without caching it', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    const stills = new CameraStills()
    put(stills, 2)
    const res = await makeApp({ stills }).inject({ method: 'GET', url: '/api/boards/b1/camera/2?t=1790700000000' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.rawPayload).toEqual(jpeg)
  })

  it('serves anyone who may watch the game on the board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'other' } as any)
    const stills = new CameraStills()
    put(stills)
    for (const [session, isLobbyMember] of [
      [seated, () => Promise.resolve(false)],
      [inLobby, (l: string, u: string) => Promise.resolve(l === 'l1' && u === 'user-1')],
    ] as const) {
      const getSessionByBoard = vi.fn().mockReturnValue(session)
      const res = await makeApp({ stills, getSessionByBoard, isLobbyMember }).inject({ method: 'GET', url: '/api/boards/b1/camera/0' })
      expect(res.statusCode).toBe(200)
      expect(getSessionByBoard).toHaveBeenCalledWith('b1')
    }
  })

  it('lets the browser keep a versioned still for good, and not one of an older version', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    const stills = new CameraStills()
    const old = put(stills)
    const v = put(stills)
    const res = await makeApp({ stills }).inject({ method: 'GET', url: `/api/boards/b1/camera/0?v=${v}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    const stale = await makeApp({ stills }).inject({ method: 'GET', url: `/api/boards/b1/camera/0?v=${old}` })
    expect(stale.headers['cache-control']).toBe('no-store')
  })

  it('serves the combined still as camera 3, and rejects a camera beyond with 400', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
    const stills = new CameraStills()
    const v = put(stills, 3)
    const res = await makeApp({ stills }).inject({ method: 'GET', url: `/api/boards/b1/camera/3?v=${v}` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect((await makeApp().inject({ method: 'GET', url: '/api/boards/b1/camera/4' })).statusCode).toBe(400)
    // The live preview is per real camera: no combined one
    expect((await makeApp().inject({ method: 'GET', url: '/api/boards/b1/camera/3/live' })).statusCode).toBe(400)
  })
})

describe('Board Manager calls, relayed by the bridge', () => {
  const owned = () => vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'user-1' } as any)
  const online = (res: object | null) => {
    vi.mocked(connections.bridgeConnections).isOnline.mockReturnValue(true)
    request.mockResolvedValue(res)
  }
  // The backend never reaches the board's network itself
  beforeEach(() =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('the backend must not fetch'))),
    ),
  )
  afterEach(() => expect(global.fetch).not.toHaveBeenCalled())

  it('returns 404 when board not found', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(undefined)
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/nope/camera/0/live' })
    expect(res.statusCode).toBe(404)
  })

  it("is for the owner only: a watcher of the board's game gets 403 here, but the stored still", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'b1', owner_user_id: 'other' } as any)
    online({ id: 'x', status: 200, image: 'AA==' })
    const stills = new CameraStills()
    stills.put('b1', 0, { bytes: Buffer.from([0xff, 0xd8]), contentType: 'image/jpeg', capturedAt: '2026-10-04T12:00:00Z' })
    const watched = { ownerUserId: 'host', seats: [{ controllerUserId: 'user-1' }], lobbyId: null } as unknown as Session
    const app = makeApp({ stills, getSessionByBoard: () => watched })
    expect((await app.inject({ method: 'GET', url: '/api/boards/b1/camera/0/live' })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/api/boards/b1/start' })).statusCode).toBe(403)
    expect(request).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'GET', url: '/api/boards/b1/camera/0' })).statusCode).toBe(200)
  })

  it('returns 503 when the board is offline, or its bridge does not answer (an old bridge)', async () => {
    owned()
    vi.mocked(connections.bridgeConnections).isOnline.mockReturnValue(false)
    expect((await makeApp().inject({ method: 'POST', url: '/api/boards/b1/start' })).statusCode).toBe(503)
    expect(request).not.toHaveBeenCalled()
    online(null)
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards/b1/start' })
    expect(res.statusCode).toBe(503)
    expect(res.json().error).toMatch(/update its bridge/)
  })

  it('asks the bridge for the command and reports the Board Manager answer', async () => {
    owned()
    online({ id: 'x', status: 200 })
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards/b1/start' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 200 })
    expect(request).toHaveBeenCalledWith('b1', { op: 'start' }, expect.any(Number))
    for (const op of ['stop', 'reset', 'calibrate']) {
      await makeApp().inject({ method: 'POST', url: `/api/boards/b1/${op}` })
      expect(request).toHaveBeenLastCalledWith('b1', { op }, expect.any(Number))
    }
  })

  it('reports a Board Manager rejection as 502', async () => {
    owned()
    online({ id: 'x', status: 500 })
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards/b1/reset' })
    expect(res.statusCode).toBe(502)
    expect(res.json().error).toMatch(/Board Manager answered 500/)
  })

  it("keeps the bridge's error to itself: it names hosts on the board's network", async () => {
    owned()
    online({ id: 'x', error: 'dial tcp 10.0.0.7:3180: connect: connection refused' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards/b1/start' })
    warn.mockRestore()
    expect(res.statusCode).toBe(502)
    expect(res.json()).toEqual({ error: 'Board Manager request failed' })
  })

  it("passes on the Board Manager's state", async () => {
    owned()
    online({ id: 'x', status: 200, state: { status: 'Throw', running: true, event: 'Started', extra: 1 } })
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/b1/status' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'Throw', running: true, event: 'Started' })
    expect(request).toHaveBeenCalledWith('b1', { op: 'state' }, expect.any(Number))
  })

  it('serves the owner the raw frame the bridge fetched, uncached', async () => {
    owned()
    const frame = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    online({ id: 'x', status: 200, image: frame.toString('base64') })
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/b1/camera/1/live?t=1790700000000' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.rawPayload).toEqual(frame)
    expect(request).toHaveBeenCalledWith('b1', { op: 'camera', cam: 1 }, expect.any(Number))
  })

  it('returns 502 when the camera did not answer with an image', async () => {
    owned()
    online({ id: 'x', status: 400 })
    expect((await makeApp().inject({ method: 'GET', url: '/api/boards/b1/camera/1/live' })).statusCode).toBe(502)
  })
})

describe('PATCH /api/boards/:id', () => {
  const row = {
    id: 'board-1',
    name: 'Board',
    hardware_id: null,
    created_at: new Date() as any,
    owner_user_id: 'user-1',
    token_hash: 'hash',
    lights_enabled: true,
  }

  it('renames an owned board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(row)
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: '  Garage ' } })
    expect(res.statusCode).toBe(200)
    expect(queries.renameBoard).toHaveBeenCalledWith(expect.anything(), 'board-1', 'Garage')
  })

  it('rejects an empty name', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: ' ' } })
    expect(res.statusCode).toBe(400)
  })

  it("returns 403 for another user's board", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ ...row, owner_user_id: 'user-2' })
    const app = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: 'X' } })
    expect(res.statusCode).toBe(403)
    expect(queries.renameBoard).not.toHaveBeenCalled()
  })
})

describe('GET /api/boards/:id/events', () => {
  const row = {
    id: 'board-1',
    name: 'Board',
    hardware_id: null,
    created_at: new Date() as any,
    owner_user_id: 'user-1',
    token_hash: 'hash',
    lights_enabled: true,
  }

  it('returns the recent event feed', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(row)
    const ev = { at: '2026-09-29T19:14:08Z', kind: 'takeout.started' as const, data: {} }
    vi.mocked(connections.bridgeConnections).recentEvents.mockReturnValue([ev])
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/events' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).events).toEqual([ev])
  })

  it("returns 403 for another user's board", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ ...row, owner_user_id: 'user-2' })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/events' })
    expect(res.statusCode).toBe(403)
  })
})

describe('boards: spec enforcement', () => {
  const board = {
    id: 'board-1',
    name: 'Board',
    hardware_id: null,
    created_at: new Date('2026-08-12T10:00:00Z') as any,
    owner_user_id: 'user-1',
    token_hash: 'hash',
    lights_enabled: true,
  }

  it('checks auth before the body: signed-out + invalid body is 401, not 400', async () => {
    vi.mocked(middleware.requireAuth).mockImplementationOnce((_req: any, reply: any) => {
      reply.code(401).send({ error: 'unauthorized' })
    })
    const res = await makeApp().inject({ method: 'POST', url: '/api/boards', payload: { bogus: true } })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a whitespace-only name on rename with 400', async () => {
    const res = await makeApp().inject({ method: 'PATCH', url: '/api/boards/board-1', payload: { name: '  ' } })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a non-numeric camera index with 400', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards/board-1/camera/abc' })
    expect(res.statusCode).toBe(400)
  })

  it('lists boards with createdAt as an ISO timestamp', async () => {
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([board])
    const res = await makeApp().inject({ method: 'GET', url: '/api/boards' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).boards[0].createdAt).toBe('2026-08-12T10:00:00.000Z')
  })
})
