import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFastify } from './fastify.js'
import { lightsApiPlugin } from './lights.js'
import { LightsStore } from '../lights/store.js'
import { setupFlags } from '../flags/index.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'user-1'
    done()
  }),
}))
vi.mock('../db/queries.js', () => ({
  getBoardById: vi.fn(),
  getBoardsByOwner: vi.fn(),
}))
vi.mock('../db/lights.js', () => ({
  listWledDevices: vi.fn(),
  insertWledDevice: vi.fn(),
  updateWledDevice: vi.fn(),
  deleteWledDevice: vi.fn(),
  getLightsEnabled: vi.fn(),
  setLightsEnabled: vi.fn(),
}))
// The route gate reads the flag user through here; a non-admin by default, like sessions.test.ts.
vi.mock('../db/users.js', () => ({ getRoleAndEmail: vi.fn().mockResolvedValue({ role: null, email: 'p@x' }) }))

import * as queries from '../db/queries.js'
import * as dbLights from '../db/lights.js'

// vi.clearAllMocks() only resets call history, not an implementation a test installed with
// mockResolvedValue/mockImplementation (mockResolvedValueOnce is the exception: it self-clears).
// Reset every mock's implementation here and re-apply the shared defaults, so a persistent
// override set by one test can't leak into a later one regardless of run order.
beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(queries.getBoardById).mockReset()
  vi.mocked(queries.getBoardsByOwner).mockReset().mockResolvedValue([])
  vi.mocked(dbLights.listWledDevices).mockReset().mockResolvedValue([])
  vi.mocked(dbLights.insertWledDevice).mockReset()
  vi.mocked(dbLights.updateWledDevice).mockReset()
  vi.mocked(dbLights.deleteWledDevice).mockReset()
  vi.mocked(dbLights.getLightsEnabled).mockReset().mockResolvedValue(true)
  vi.mocked(dbLights.setLightsEnabled).mockReset().mockResolvedValue(undefined)
  // On for everyone by default, so the rest of this file can ignore the flag; the "flag off" test
  // below overrides it.
  await setupFlags(new Set(['lights.enabled']))
})
afterEach(() => vi.unstubAllEnvs())

const LIGHTS_ROUTES: { method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE'; url: string; payload?: object }[] = [
  { method: 'GET', url: '/api/boards/board-1/lights' },
  { method: 'PUT', url: '/api/boards/board-1/lights', payload: { enabled: false } },
  { method: 'POST', url: '/api/boards/board-1/lights/scan' },
  { method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: '192.168.1.80' } },
  { method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { host: '192.168.1.80' } },
  { method: 'POST', url: '/api/boards/board-1/lights/devices', payload: { mac: 'aa', name: 'Strip', segmentMode: 'whole', maxBri: 178 } },
  { method: 'PATCH', url: '/api/boards/board-1/lights/devices/d1', payload: { name: 'x' } },
  { method: 'DELETE', url: '/api/boards/board-1/lights/devices/d1' },
  { method: 'POST', url: '/api/boards/board-1/lights/test', payload: { rule: 0 } },
]

const board = (overrides: Partial<{ id: string; owner_user_id: string; name: string }> = {}) => ({
  id: 'board-1',
  owner_user_id: 'user-1',
  name: 'Board',
  ...overrides,
})

type MakeAppOpts = {
  lights?: {
    test?: (boardId: string, ruleIndex: number) => Promise<boolean>
    devicesChanged?: (boardId: string) => Promise<void>
    darkenDevice?: (boardId: string, deviceId: string) => Promise<void>
  }
  store?: LightsStore
  send?: (boardId: string, msg: object) => boolean
  bridgeVersion?: (boardId: string) => string | null | undefined
  isOnline?: (boardId: string) => boolean
}

function makeApp(opts: MakeAppOpts = {}) {
  const app = createFastify()
  const lights = {
    test: vi.fn().mockResolvedValue(true),
    devicesChanged: vi.fn().mockResolvedValue(undefined),
    darkenDevice: vi.fn().mockResolvedValue(undefined),
    ...opts.lights,
  }
  const store = opts.store ?? new LightsStore()
  const send = opts.send ?? vi.fn().mockReturnValue(true)
  const bridgeVersion = opts.bridgeVersion ?? (() => 'v0.4.2')
  const isOnline = opts.isOnline ?? (() => true)
  app.register(lightsApiPlugin, { db: {} as any, lights, store, send, bridgeVersion, isOnline })
  return { app, lights, store, send }
}

const foundDevice = (
  overrides: Partial<{ mac: string; host: string; name: string; leds: number; version: string; segments: number }> = {},
) => ({
  mac: 'aa:bb:cc:dd:ee:ff',
  host: '192.168.1.80',
  name: 'WLED',
  leds: 30,
  version: '0.14.0',
  segments: 1,
  ...overrides,
})

describe('ownership: 403/404', () => {
  const routes = LIGHTS_ROUTES

  it('is 404 for an unknown board, on every route', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(undefined)
    const { app } = makeApp()
    for (const r of routes) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload })
      expect(res.statusCode).toBe(404)
    }
  })

  it("is 403 for another user's board, on every route", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board({ owner_user_id: 'other' }) as any)
    const { app } = makeApp()
    for (const r of routes) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload })
      expect(res.statusCode).toBe(403)
    }
  })
})

describe('GET /api/boards/:id/lights', () => {
  it("returns found devices not already paired to this board, and marks one paired to another of the owner's boards", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(queries.getBoardsByOwner).mockResolvedValue([board(), board({ id: 'board-2', name: 'Garage' })] as any)
    vi.mocked(dbLights.listWledDevices).mockImplementation((_db, boardId: string) =>
      Promise.resolve(
        boardId === 'board-2' ? ([{ id: 'd2', board_id: 'board-2', mac: 'aa:bb:cc:dd:ee:ff', host: 'h', name: 'n' }] as any) : [],
      ),
    )
    const store = new LightsStore()
    store.setFound(
      'board-1',
      [foundDevice(), foundDevice({ mac: 'ff:ee:dd:cc:bb:aa', host: '192.168.1.81' })],
      new Date('2026-10-19T10:00:00Z'),
    )
    const { app } = makeApp({ store })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.found).toHaveLength(2)
    const paired = body.found.find((d: any) => d.mac === 'aa:bb:cc:dd:ee:ff')
    expect(paired.onBoard).toBe('Garage')
    const other = body.found.find((d: any) => d.mac === 'ff:ee:dd:cc:bb:aa')
    expect(other.onBoard).toBeUndefined()
  })

  it('excludes devices already paired to this board from found', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.listWledDevices).mockResolvedValue([
      {
        id: 'd1',
        board_id: 'board-1',
        mac: 'aa:bb:cc:dd:ee:ff',
        name: 'Strip',
        host: '192.168.1.80',
        leds: 30,
        version: '0.14.0',
        segments: 1,
        segment_mode: 'whole',
        max_bri: 178,
        created_at: new Date(),
      },
    ] as any)
    const store = new LightsStore()
    store.setFound('board-1', [foundDevice()], new Date())
    const { app } = makeApp({ store })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    const body = res.json()
    expect(body.found).toEqual([])
    expect(body.devices).toHaveLength(1)
    expect(body.devices[0]).toMatchObject({ id: 'd1', mac: 'aa:bb:cc:dd:ee:ff', segmentMode: 'whole', maxBri: 178, reachable: null })
  })

  it('reports bridgeOutdated for an old bridge version while online', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ bridgeVersion: () => '0.3.1', isOnline: () => true })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    const body = res.json()
    expect(body.bridgeOutdated).toBe(true)
    expect(body.bridgeOnline).toBe(true)
  })

  it('reports bridgeOutdated for a connected bridge with no version (parseHello can leave it null)', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ bridgeVersion: () => null, isOnline: () => true })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    expect(res.json().bridgeOutdated).toBe(true)
  })

  it('reports bridgeOnline false when not connected, and never claims outdated while offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ bridgeVersion: () => '0.3.1', isOnline: () => false })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    const body = res.json()
    expect(body.bridgeOnline).toBe(false)
    expect(body.bridgeOutdated).toBe(false)
  })

  it('reports the scan error from the store', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const store = new LightsStore()
    store.setFound('board-1', [], new Date(), 'no response')
    const { app } = makeApp({ store })
    const res = await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })
    expect(res.json().scanError).toBe('no response')
  })
})

describe('POST /api/boards/:id/lights/devices', () => {
  it('pairs a found device: 201, host/leds/version/segments from found, devicesChanged called', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const store = new LightsStore()
    store.setFound('board-1', [foundDevice()], new Date())
    vi.mocked(dbLights.insertWledDevice).mockResolvedValue({
      id: 'd1',
      board_id: 'board-1',
      mac: 'aa:bb:cc:dd:ee:ff',
      name: 'Strip',
      host: '192.168.1.80',
      leds: 30,
      version: '0.14.0',
      segments: 1,
      segment_mode: 'whole',
      max_bri: 178,
      created_at: new Date(),
    } as any)
    const { app, lights } = makeApp({ store })
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards/board-1/lights/devices',
      payload: { mac: 'aa:bb:cc:dd:ee:ff', name: 'Strip', segmentMode: 'whole', maxBri: 178 },
    })
    expect(res.statusCode).toBe(201)
    expect(dbLights.insertWledDevice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        board_id: 'board-1',
        mac: 'aa:bb:cc:dd:ee:ff',
        host: '192.168.1.80',
        leds: 30,
        version: '0.14.0',
        segments: 1,
      }),
    )
    expect(res.json()).toMatchObject({ id: 'd1', mac: 'aa:bb:cc:dd:ee:ff', host: '192.168.1.80' })
    expect(lights.devicesChanged).toHaveBeenCalledWith('board-1')
  })

  it("400s a MAC that's not in found", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards/board-1/lights/devices',
      payload: { mac: 'aa:bb:cc:dd:ee:ff', name: 'Strip', segmentMode: 'whole', maxBri: 178 },
    })
    expect(res.statusCode).toBe(400)
    expect(dbLights.insertWledDevice).not.toHaveBeenCalled()
  })

  it('409s pairing the same MAC twice', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const store = new LightsStore()
    store.setFound('board-1', [foundDevice()], new Date())
    const dupError = Object.assign(new Error('duplicate'), { code: '23505' })
    vi.mocked(dbLights.insertWledDevice).mockRejectedValue(dupError)
    const { app } = makeApp({ store })
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards/board-1/lights/devices',
      payload: { mac: 'aa:bb:cc:dd:ee:ff', name: 'Strip', segmentMode: 'whole', maxBri: 178 },
    })
    expect(res.statusCode).toBe(409)
  })
})

describe('PATCH /api/boards/:id/lights/devices/:deviceId', () => {
  it('updates and notifies devicesChanged', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.updateWledDevice).mockResolvedValue({
      id: 'd1',
      board_id: 'board-1',
      mac: 'aa',
      name: 'New name',
      host: 'h',
      leds: 1,
      version: 'v',
      segments: 1,
      segment_mode: 'perSeat',
      max_bri: 200,
      created_at: new Date(),
    } as any)
    const { app, lights } = makeApp()
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/boards/board-1/lights/devices/d1',
      payload: { name: 'New name', segmentMode: 'perSeat', maxBri: 200 },
    })
    expect(res.statusCode).toBe(200)
    expect(dbLights.updateWledDevice).toHaveBeenCalledWith(expect.anything(), 'board-1', 'd1', {
      name: 'New name',
      segment_mode: 'perSeat',
      max_bri: 200,
    })
    expect(lights.devicesChanged).toHaveBeenCalledWith('board-1')
  })

  it('404s an unknown device', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.updateWledDevice).mockResolvedValue(undefined)
    const { app } = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1/lights/devices/d1', payload: { name: 'x' } })
    expect(res.statusCode).toBe(404)
  })

  it('404s a device id that belongs to another board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    // The db query scopes the row by board_id; simulate a device that only exists under board-2.
    vi.mocked(dbLights.updateWledDevice).mockImplementation((_db, boardId: string) =>
      Promise.resolve(boardId === 'board-1' ? undefined : ({} as any)),
    )
    const { app } = makeApp()
    const res = await app.inject({ method: 'PATCH', url: '/api/boards/board-1/lights/devices/d-on-board-2', payload: { name: 'x' } })
    expect(res.statusCode).toBe(404)
    expect(dbLights.updateWledDevice).toHaveBeenCalledWith(expect.anything(), 'board-1', 'd-on-board-2', { name: 'x' })
  })
})

describe('DELETE /api/boards/:id/lights/devices/:deviceId', () => {
  it('204s, darkens the device, then notifies devicesChanged', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.deleteWledDevice).mockResolvedValue(true)
    const { app, lights } = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1/lights/devices/d1' })
    expect(res.statusCode).toBe(204)
    expect(lights.darkenDevice).toHaveBeenCalledWith('board-1', 'd1')
    expect(lights.devicesChanged).toHaveBeenCalledWith('board-1')
  })

  it('404s when nothing was deleted', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.deleteWledDevice).mockResolvedValue(false)
    const { app } = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1/lights/devices/d1' })
    expect(res.statusCode).toBe(404)
  })

  it('404s a device id that belongs to another board', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.deleteWledDevice).mockImplementation((_db, boardId: string) => Promise.resolve(boardId !== 'board-1'))
    const { app } = makeApp()
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/board-1/lights/devices/d-on-board-2' })
    expect(res.statusCode).toBe(404)
    expect(dbLights.deleteWledDevice).toHaveBeenCalledWith(expect.anything(), 'board-1', 'd-on-board-2')
  })
})

describe('PUT /api/boards/:id/lights', () => {
  it('stores enabled and notifies devicesChanged', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, lights } = makeApp()
    const res = await app.inject({ method: 'PUT', url: '/api/boards/board-1/lights', payload: { enabled: false } })
    expect(res.statusCode).toBe(204)
    expect(dbLights.setLightsEnabled).toHaveBeenCalledWith(expect.anything(), 'board-1', false)
    expect(lights.devicesChanged).toHaveBeenCalledWith('board-1')
  })
})

describe('POST /api/boards/:id/lights/scan', () => {
  it('503s when the bridge is offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp({ isOnline: () => false })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/scan' })
    expect(res.statusCode).toBe(503)
    expect(send).not.toHaveBeenCalled()
  })

  it('503s when the bridge is too old to support lights', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ bridgeVersion: () => '0.3.1' })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/scan' })
    expect(res.statusCode).toBe(503)
  })

  it('202s and sends wled.scan', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/scan' })
    expect(res.statusCode).toBe(202)
    expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.scan' })
  })
})

describe('POST /api/boards/:id/lights/probe', () => {
  it('400s a non-local host', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: 'example.com' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/Local addresses only/)
    expect(send).not.toHaveBeenCalled()
  })

  it('202s a local host and sends wled.probe', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(202)
    expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.probe', data: { host: '192.168.1.80' } })
  })

  it('503s while the bridge is offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ isOnline: () => false })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(503)
  })

  it('400s loopback by default, 202 with DARTCADE_WLED_ALLOW_LOOPBACK=1', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: '127.0.0.1' } })
    expect(res.statusCode).toBe(400)
    expect(send).not.toHaveBeenCalled()

    vi.stubEnv('DARTCADE_WLED_ALLOW_LOOPBACK', '1')
    const { app: allowed, send: sendAllowed } = makeApp()
    const res2 = await allowed.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host: '127.0.0.1' } })
    expect(res2.statusCode).toBe(202)
    expect(sendAllowed).toHaveBeenCalledWith('board-1', { kind: 'wled.probe', data: { host: '127.0.0.1' } })
  })

  it('202s a .local name and an IPv6 link-local address', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    for (const host of ['wled-ring.local', 'fe80::1']) {
      const { app, send } = makeApp()
      const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/probe', payload: { host } })
      expect(res.statusCode).toBe(202)
      expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.probe', data: { host } })
    }
  })
})

describe('POST /api/boards/:id/lights/blink', () => {
  it("sends a paired device's host from deviceId", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.listWledDevices).mockResolvedValue([{ id: 'd1', board_id: 'board-1', host: '192.168.1.80' } as any])
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { deviceId: 'd1' } })
    expect(res.statusCode).toBe(202)
    expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.blink', data: { host: '192.168.1.80' } })
  })

  it("accepts a paired device's host even when it's not in found (e.g. right after a backend restart)", async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.listWledDevices).mockResolvedValue([{ id: 'd1', board_id: 'board-1', host: '192.168.1.80' } as any])
    const { app, send } = makeApp() // store has nothing found yet
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(202)
    expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.blink', data: { host: '192.168.1.80' } })
  })

  it('400s a host not in found and not paired', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, send } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })

  it('202s a found host', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const store = new LightsStore()
    store.setFound('board-1', [foundDevice()], new Date())
    const { app, send } = makeApp({ store })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(202)
    expect(send).toHaveBeenCalledWith('board-1', { kind: 'wled.blink', data: { host: '192.168.1.80' } })
  })

  it('503s while the bridge is offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const store = new LightsStore()
    store.setFound('board-1', [foundDevice()], new Date())
    const { app } = makeApp({ store, isOnline: () => false })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/blink', payload: { host: '192.168.1.80' } })
    expect(res.statusCode).toBe(503)
  })
})

describe('POST /api/boards/:id/lights/test', () => {
  it('409s when lights are off', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    vi.mocked(dbLights.getLightsEnabled).mockResolvedValueOnce(false)
    const { app, lights } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/test', payload: { rule: 0 } })
    expect(res.statusCode).toBe(409)
    expect(lights.test).not.toHaveBeenCalled()
  })

  it('503s while the bridge is offline', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, lights } = makeApp({ isOnline: () => false })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/test', payload: { rule: 0 } })
    expect(res.statusCode).toBe(503)
    expect(lights.test).not.toHaveBeenCalled()
  })

  it('503s when the bridge is too old to support lights', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp({ bridgeVersion: () => '0.3.1' })
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/test', payload: { rule: 0 } })
    expect(res.statusCode).toBe(503)
  })

  it('202s otherwise and plays the rule', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app, lights } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/test', payload: { rule: 2 } })
    expect(res.statusCode).toBe(202)
    expect(lights.test).toHaveBeenCalledWith('board-1', 2)
  })
})

describe('lights.enabled flag', () => {
  it('404s every route for a user the flag is off for, even on their own board', async () => {
    await setupFlags(new Set()) // off by default (non-admin, per the db/users.js mock above)
    vi.mocked(queries.getBoardById).mockResolvedValue(board() as any)
    const { app } = makeApp()
    for (const r of LIGHTS_ROUTES) {
      const res = await app.inject({ method: r.method, url: r.url, payload: r.payload })
      expect(res.statusCode).toBe(404)
    }
  })
})
