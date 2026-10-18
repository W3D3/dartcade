// WLED devices paired to a board, and the master switch and profile that drive them (#135).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { isIPv4, isIPv6 } from 'node:net'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { findOwnBoard } from '../boards/own.js'
import { getBoardsByOwner } from '../db/queries.js'
import {
  listWledDevices,
  insertWledDevice,
  updateWledDevice as updateWledDeviceRow,
  deleteWledDevice as deleteWledDeviceRow,
  getLightsEnabled,
  setLightsEnabled,
  type WledDeviceRow,
} from '../db/lights.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { lightsStore, type LightsStore } from '../lights/store.js'
import type { LightsService } from '../lights/service.js'
import { supportsLights } from '../lights/version.js'
import { DEFAULT_PROFILE } from '../shared/lights/index.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Drives the lights as devices or the master switch change; a safe no-op when the backend
   *  runs without the lights service wired up (tests that don't exercise it). */
  lights?: Pick<LightsService, 'test' | 'devicesChanged' | 'darkenDevice'>
  /** Where wled devices found on a board's network are kept (tests pass their own). */
  store?: LightsStore
  send?: (boardId: string, msg: object) => boolean
  bridgeVersion?: (boardId: string) => string | null | undefined
  isOnline?: (boardId: string) => boolean
}

const noopLights: Pick<LightsService, 'test' | 'devicesChanged' | 'darkenDevice'> = {
  test: () => Promise.resolve(false),
  devicesChanged: () => Promise.resolve(),
  darkenDevice: () => Promise.resolve(),
}

/** Strips a `:port` suffix, but not from a bare (unbracketed) IPv6 address, which has its own colons. */
function stripPort(host: string): string {
  return host.split(':').length === 2 ? host.replace(/:\d+$/, '') : host
}

/** shortcut: a simplified TS copy of the bridge's cheap pre-check (bridge/internal/wled/hosts.go
 *  LocalHost) for RFC 1918 IPv4, IPv6 link-local (fe80::/10) and ULA (fc00::/7), or an mDNS
 *  `.local` name. Loopback is refused unless DARTCADE_WLED_ALLOW_LOOPBACK=1 (dev testing with a
 *  fake WLED). It is not the real guard — the bridge's dialer re-checks the resolved IP at
 *  connect time — this just gives a clear 400 before the bridge would silently drop the request;
 *  upgrade if a probe needs to reach a host this pre-check mis-classifies. */
function isLocalHost(host: string): boolean {
  if (!host || /[/@?#]/.test(host) || host.includes('://')) return false
  // Read per call, not cached at module load: lets tests (and a backend restarted with the
  // env var changed) see the current value.
  const allowLoopback = process.env.DARTCADE_WLED_ALLOW_LOOPBACK === '1'
  const bracketed = /^\[(.+)\]$/.exec(host)
  const h = bracketed ? bracketed[1] : stripPort(host)
  if (isIPv4(h)) {
    if (h.startsWith('127.')) return allowLoopback
    const [a, b] = h.split('.').map(Number)
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (isIPv6(h)) {
    if (h === '::1') return allowLoopback
    const firstGroup = parseInt(h.split(':')[0] || '0', 16)
    return (firstGroup & 0xffc0) === 0xfe80 || (firstGroup & 0xfe00) === 0xfc00
  }
  return h.toLowerCase().endsWith('.local')
}

function deviceView(d: WledDeviceRow, store: LightsStore) {
  const status = store.status(d.board_id, d.id)
  return {
    id: d.id,
    mac: d.mac,
    name: d.name,
    host: d.host,
    leds: d.leds,
    version: d.version,
    segments: d.segments,
    segmentMode: d.segment_mode,
    maxBri: d.max_bri,
    reachable: status?.reachable ?? null,
    ...(status?.error !== undefined && { error: status.error }),
    ...(status && { since: status.since.toISOString() }),
  }
}

export function lightsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const {
    db,
    lights = noopLights,
    store = lightsStore,
    send = (boardId: string, msg: object) => bridgeConnections.send(boardId, msg),
    bridgeVersion = (boardId: string) => bridgeConnections.get(boardId)?.bridgeVersion,
    isOnline = (boardId: string) => bridgeConnections.isOnline(boardId),
  } = opts

  /** The board if the lights.enabled flag is on for the user and it exists and belongs to them;
   *  otherwise sends 404/403 and returns null. Behind the flag like every other gated feature:
   *  off, the whole API is 404, not just hidden in the UI. */
  async function ownBoard(id: string, userId: string, reply: { code(n: number): { send(b: { error: string }): unknown } }) {
    if (!(await flagEnabled('lights.enabled', await loadFlagUser(db, userId)))) {
      reply.code(404).send({ error: 'not found' })
      return null
    }
    const own = await findOwnBoard(db, id, userId)
    if ('board' in own) return own.board
    if (own.problem === 'not_found') reply.code(404).send({ error: 'not found' })
    else reply.code(403).send({ error: 'forbidden' })
    return null
  }

  /** The bridge is connected and new enough to run wled messages. */
  const bridgeReady = (id: string) => isOnline(id) && supportsLights(bridgeVersion(id))

  const notifyChanged = (id: string, log: { warn(obj: unknown, msg: string): void }) =>
    void lights.devicesChanged(id).catch((err: unknown) => log.warn({ err }, 'lights devicesChanged failed'))

  app.get<Route<'getBoardLights'>>(
    '/api/boards/:id/lights',
    { preValidation: requireAuth, schema: fromSpec('getBoardLights') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply

      const [enabled, devices, otherBoards] = await Promise.all([
        getLightsEnabled(db, id),
        listWledDevices(db, id),
        getBoardsByOwner(db, req.userId),
      ])
      const pairedMacs = new Set(devices.map(d => d.mac))
      const macToBoardName = new Map<string, string>()
      for (const b of otherBoards) {
        if (b.id === id) continue
        for (const d of await listWledDevices(db, b.id)) macToBoardName.set(d.mac, b.name)
      }
      const found = store.found(id)
      const version = bridgeVersion(id)

      return reply.send({
        enabled,
        bridgeOnline: isOnline(id),
        bridgeOutdated: isOnline(id) && !supportsLights(version),
        devices: devices.map(d => deviceView(d, store)),
        found: found.devices
          .filter(d => !pairedMacs.has(d.mac))
          .map(d => ({ ...d, ...(macToBoardName.has(d.mac) && { onBoard: macToBoardName.get(d.mac) }) })),
        lastScanAt: found.scannedAt ? found.scannedAt.toISOString() : null,
        probe: found.probe,
        profile: { ...DEFAULT_PROFILE, builtIn: true },
        scanError: found.scanError ?? null,
      })
    },
  )

  app.put<Route<'setBoardLights'>>(
    '/api/boards/:id/lights',
    { preValidation: requireAuth, schema: fromSpec('setBoardLights') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      await setLightsEnabled(db, id, req.body.enabled)
      notifyChanged(id, req.log)
      return reply.code(204).send()
    },
  )

  app.post<Route<'scanBoardLights'>>(
    '/api/boards/:id/lights/scan',
    { preValidation: requireAuth, schema: fromSpec('scanBoardLights') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      if (!bridgeReady(id)) return reply.code(503).send({ error: 'board offline' })
      send(id, { kind: 'wled.scan' })
      return reply.code(202).send()
    },
  )

  app.post<Route<'probeBoardLights'>>(
    '/api/boards/:id/lights/probe',
    { preValidation: requireAuth, schema: fromSpec('probeBoardLights') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const { host } = req.body
      if (!isLocalHost(host)) return reply.code(400).send({ error: 'Local addresses only' })
      if (!bridgeReady(id)) return reply.code(503).send({ error: 'board offline' })
      send(id, { kind: 'wled.probe', data: { host } })
      return reply.code(202).send()
    },
  )

  app.post<Route<'blinkBoardLights'>>(
    '/api/boards/:id/lights/blink',
    { preValidation: requireAuth, schema: fromSpec('blinkBoardLights') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const { host: bodyHost, deviceId } = req.body
      const devices = await listWledDevices(db, id)
      let host: string | undefined
      if (deviceId !== undefined) {
        host = devices.find(d => d.id === deviceId)?.host
        if (!host) return reply.code(400).send({ error: 'no such device' })
      } else if (bodyHost !== undefined) {
        // Accepts a paired device's host too, so blink still works right after a backend
        // restart, before the next scan has refilled the found list.
        const found = store.found(id).devices
        if (!found.some(d => d.host === bodyHost) && !devices.some(d => d.host === bodyHost)) {
          return reply.code(400).send({ error: 'not found by a scan or probe' })
        }
        host = bodyHost
      } else {
        return reply.code(400).send({ error: 'host or deviceId is required' })
      }
      if (!bridgeReady(id)) return reply.code(503).send({ error: 'board offline' })
      send(id, { kind: 'wled.blink', data: { host } })
      return reply.code(202).send()
    },
  )

  app.post<Route<'addWledDevice'>>(
    '/api/boards/:id/lights/devices',
    { preValidation: requireAuth, schema: fromSpec('addWledDevice') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const { mac, name, segmentMode, maxBri } = req.body
      const found = store.found(id).devices.find(d => d.mac === mac)
      if (!found) return reply.code(400).send({ error: 'not found by a scan or probe' })
      let row: WledDeviceRow
      try {
        row = await insertWledDevice(db, {
          board_id: id,
          mac,
          name,
          host: found.host,
          leds: found.leds,
          version: found.version,
          segments: found.segments,
          segment_mode: segmentMode,
          max_bri: maxBri,
        })
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) return reply.code(409).send({ error: 'already paired' })
        throw err
      }
      notifyChanged(id, req.log)
      return reply.code(201).send(deviceView(row, store))
    },
  )

  app.patch<Route<'updateWledDevice'>>(
    '/api/boards/:id/lights/devices/:deviceId',
    { preValidation: requireAuth, schema: fromSpec('updateWledDevice') },
    async (req, reply) => {
      const { id, deviceId } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const { name, segmentMode, maxBri } = req.body
      const patch: Partial<Pick<WledDeviceRow, 'name' | 'segment_mode' | 'max_bri'>> = {}
      if (name !== undefined) patch.name = name
      if (segmentMode !== undefined) patch.segment_mode = segmentMode
      if (maxBri !== undefined) patch.max_bri = maxBri
      const row = await updateWledDeviceRow(db, id, deviceId, patch)
      if (!row) return reply.code(404).send({ error: 'not found' })
      notifyChanged(id, req.log)
      return reply.send(deviceView(row, store))
    },
  )

  app.delete<Route<'deleteWledDevice'>>(
    '/api/boards/:id/lights/devices/:deviceId',
    { preValidation: requireAuth, schema: fromSpec('deleteWledDevice') },
    async (req, reply) => {
      const { id, deviceId } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      const ok = await deleteWledDeviceRow(db, id, deviceId)
      if (!ok) return reply.code(404).send({ error: 'not found' })
      // Before the new allowlist, which drops its worker: otherwise a pending off never reaches it.
      void lights.darkenDevice(id, deviceId).catch((err: unknown) => req.log.warn({ err }, 'lights darkenDevice failed'))
      notifyChanged(id, req.log)
      return reply.code(204).send()
    },
  )

  app.post<Route<'testBoardLight'>>(
    '/api/boards/:id/lights/test',
    { preValidation: requireAuth, schema: fromSpec('testBoardLight') },
    async (req, reply) => {
      const { id } = req.params
      const board = await ownBoard(id, req.userId, reply)
      if (!board) return reply
      if (!(await getLightsEnabled(db, id))) return reply.code(409).send({ error: 'lights are off' })
      if (!bridgeReady(id)) return reply.code(503).send({ error: 'board offline' })
      void lights.test(id, req.body.rule).catch((err: unknown) => req.log.warn({ err }, 'lights test failed'))
      return reply.code(202).send()
    },
  )

  done()
}
