import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { createHash, randomBytes } from 'crypto'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { getBoardsByOwner, insertBoard, getBoardById, deleteBoard, renameBoard } from '../db/queries.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

// Board Manager commands: [operationId, route suffix, BM path, fallback path for older BMs, method]
const ACTIONS = [
  ['startBoard',     'start',     '/api/start',                                   '/api/detection/start', 'PUT' ],
  ['stopBoard',      'stop',      '/api/stop',                                    '/api/detection/stop',  'PUT' ],
  ['resetBoard',     'reset',     '/api/reset',                                   undefined,              'POST'],
  ['calibrateBoard', 'calibrate', '/api/config/calibration/auto?distortion=true', undefined,              'POST'],
] as const

export async function boardsApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts

  /** The board if it exists and belongs to the user; otherwise sends 404/403 and returns null. */
  async function ownBoard(id: string, userId: string, reply: { code(n: number): { send(b: { error: string }): unknown } }) {
    const board = await getBoardById(db, id)
    if (!board) { reply.code(404).send({ error: 'not found' }); return null }
    if (board.owner_user_id !== userId) { reply.code(403).send({ error: 'forbidden' }); return null }
    return board
  }

  app.get<Route<'listBoards'>>('/api/boards', { preValidation: requireAuth, schema: fromSpec('listBoards') }, async (req) => {
    const rows = await getBoardsByOwner(db, req.userId)
    return {
      boards: rows.map(b => {
        const conn = bridgeConnections.get(b.id)
        const bm = conn?.bmUrl ? (() => { try { return new URL(conn.bmUrl) } catch { return null } })() : null
        return {
          id: b.id,
          name: b.name,
          hardwareId: b.hardware_id,
          online: bridgeConnections.isOnline(b.id),
          bridgeVersion: conn?.bridgeVersion ?? null,
          bmVersion: conn?.bmVersion ?? null,
          createdAt: new Date(b.created_at).toISOString(),
          ip: bm?.hostname ?? null,
          // Full Board Manager origin (incl. port) for linking
          bmUrl: bm?.origin ?? null,
        }
      }),
    }
  })

  app.get<Route<'getBoardCamera'>>('/api/boards/:id/camera/:index', { preValidation: requireAuth, schema: fromSpec('getBoardCamera') }, async (req, reply) => {
    const { id, index } = req.params
    if (!await ownBoard(id, req.userId, reply)) return reply
    const conn = bridgeConnections.get(id)
    if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })

    const upstream = await fetch(`${conn.bmUrl}/api/img/cams/${index}`)
    if (!upstream.ok) return reply.code(502).send({ error: 'camera unavailable' })

    const buf = await upstream.arrayBuffer()
    reply.header('content-type', upstream.headers.get('content-type') ?? 'image/jpeg')
    reply.header('cache-control', 'no-store')
    return reply.send(Buffer.from(buf) as never)   // binary body; not part of the JSON Reply type
  })

  app.post<Route<'createBoard'>>('/api/boards', { preValidation: requireAuth, schema: fromSpec('createBoard') }, async (req, reply) => {
    const name = req.body.name.trim()
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const id = ulid()
    await insertBoard(db, { id, owner_user_id: req.userId, name, token_hash: tokenHash })
    return reply.code(201).send({ id, name, token: rawToken })
  })

  app.patch<Route<'renameBoard'>>('/api/boards/:id', { preValidation: requireAuth, schema: fromSpec('renameBoard') }, async (req, reply) => {
    const { id } = req.params
    const name = req.body.name.trim()
    if (!await ownBoard(id, req.userId, reply)) return reply
    await renameBoard(db, id, name)
    return reply.send({ id, name })
  })

  // Recent bridge events for the live feed (in-memory, newest last)
  app.get<Route<'getBoardEvents'>>('/api/boards/:id/events', { preValidation: requireAuth, schema: fromSpec('getBoardEvents') }, async (req, reply) => {
    const { id } = req.params
    if (!await ownBoard(id, req.userId, reply)) return reply
    return reply.send({ events: bridgeConnections.recentEvents(id) as never })
  })

  // Per-board BM status
  app.get<Route<'getBoardStatus'>>('/api/boards/:id/status', { preValidation: requireAuth, schema: fromSpec('getBoardStatus') }, async (req, reply) => {
    const { id } = req.params
    if (!await ownBoard(id, req.userId, reply)) return reply
    const conn = bridgeConnections.get(id)
    if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })
    try {
      const res = await fetch(`${conn.bmUrl}/api/state`)
      if (!res.ok) return reply.code(502).send({ error: `Board Manager answered ${res.status}` })
      const data = await res.json() as { status?: string; running?: boolean; event?: string }
      return reply.send({ status: data.status ?? null, running: data.running ?? false, event: data.event ?? null })
    } catch {
      return reply.code(503).send({ error: 'board unreachable' })
    }
  })

  // Per-board BM actions
  for (const [operationId, action, path, fallback, method] of ACTIONS) {
    app.post<Route<typeof operationId>>(`/api/boards/:id/${action}`, { preValidation: requireAuth, schema: fromSpec(operationId) }, async (req, reply) => {
      const { id } = req.params
      if (!await ownBoard(id, req.userId, reply)) return reply
      const conn = bridgeConnections.get(id)
      if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })
      try {
        const tryFetch = (url: string) => fetch(url, { method, headers: { 'Content-Length': '0' } })
        let res = await tryFetch(conn.bmUrl + path)
        if ((res.status === 404 || res.status === 405) && fallback) res = await tryFetch(conn.bmUrl + fallback)
        if (!res.ok) return reply.code(502).send({ error: `Board Manager answered ${res.status}` })
        return reply.send({ status: res.status })
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : 'Board Manager request failed' })
      }
    })
  }

  app.delete<Route<'deleteBoard'>>('/api/boards/:id', { preValidation: requireAuth, schema: fromSpec('deleteBoard') }, async (req, reply) => {
    const { id } = req.params
    if (!await ownBoard(id, req.userId, reply)) return reply
    try {
      await deleteBoard(db, id)
    } catch (err: any) {
      if (err.code === '23503') return reply.code(409).send({ error: 'board has active sessions' })
      throw err
    }
    return reply.code(204).send()
  })
}
