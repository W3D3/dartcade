import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { createHash, randomBytes } from 'crypto'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { getBoardsByOwner, insertBoard, getBoardById, deleteBoard, renameBoard } from '../db/queries.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

export async function boardsApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts

  app.get('/api/boards', { preHandler: requireAuth }, async (req) => {
    const rows = await getBoardsByOwner(db, req.userId)
    return {
      boards: rows.map(b => {
        const conn = bridgeConnections.get(b.id)
        const bm = conn?.bmUrl ? (() => { try { return new URL(conn.bmUrl!) } catch { return null } })() : null
        return {
          id: b.id,
          name: b.name,
          hardwareId: b.hardware_id,
          online: bridgeConnections.isOnline(b.id),
          bridgeVersion: conn?.bridgeVersion ?? null,
          bmVersion: conn?.bmVersion ?? null,
          createdAt: b.created_at,
          ip: bm?.hostname ?? null,
          // Full Board Manager origin (incl. port) for linking
          bmUrl: bm?.origin ?? null,
        }
      }),
    }
  })

  app.get('/api/boards/:id/camera/:index', { preHandler: requireAuth }, async (req, reply) => {
    const { id, index } = req.params as { id: string; index: string }
    const board = await getBoardById(db, id)
    if (!board) return reply.code(404).send({ error: 'not found' })
    if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })

    const conn = bridgeConnections.get(id)
    if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })

    const upstream = await fetch(`${conn.bmUrl}/api/img/cams/${index}`)
    if (!upstream.ok) return reply.code(502).send({ error: 'camera unavailable' })

    const buf = await upstream.arrayBuffer()
    reply.header('content-type', upstream.headers.get('content-type') ?? 'image/jpeg')
    reply.header('cache-control', 'no-store')
    return reply.send(Buffer.from(buf))
  })

  app.post('/api/boards', { preHandler: requireAuth }, async (req, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.code(400).send({ error: 'name required' })
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const id = ulid()
    await insertBoard(db, { id, owner_user_id: req.userId, name: name.trim(), token_hash: tokenHash })
    return reply.code(201).send({ id, name: name.trim(), token: rawToken })
  })

  app.patch('/api/boards/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { name } = (req.body ?? {}) as { name?: string }
    if (!name?.trim()) return reply.code(400).send({ error: 'name required' })
    const board = await getBoardById(db, id)
    if (!board) return reply.code(404).send({ error: 'not found' })
    if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    await renameBoard(db, id, name.trim())
    return reply.send({ id, name: name.trim() })
  })

  // Recent bridge events for the live feed (in-memory, newest last)
  app.get('/api/boards/:id/events', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const board = await getBoardById(db, id)
    if (!board) return reply.code(404).send({ error: 'not found' })
    if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    return reply.send({ events: bridgeConnections.recentEvents(id) })
  })

  // Per-board BM status
  app.get('/api/boards/:id/status', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const board = await getBoardById(db, id)
    if (!board) return reply.code(404).send({ error: 'not found' })
    if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    const conn = bridgeConnections.get(id)
    if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })
    try {
      const res = await fetch(`${conn.bmUrl}/api/state`)
      if (!res.ok) return reply.code(res.status).send({ error: 'board error' })
      const data = await res.json() as any
      return reply.send({ status: data.status ?? null, running: data.running ?? false, event: data.event ?? null })
    } catch {
      return reply.code(503).send({ error: 'board unreachable' })
    }
  })

  // Per-board BM actions
  for (const [action, path, fallback, method] of [
    ['start',     '/api/start',                             '/api/detection/start',  'PUT' ],
    ['stop',      '/api/stop',                              '/api/detection/stop',   'PUT' ],
    ['reset',     '/api/reset',                             undefined,               'POST'],
    ['calibrate', '/api/config/calibration/auto?distortion=true', undefined,         'POST'],
  ] as const) {
    app.post(`/api/boards/:id/${action}`, { preHandler: requireAuth }, async (req, reply) => {
      const { id } = req.params as { id: string }
      const board = await getBoardById(db, id)
      if (!board) return reply.code(404).send({ error: 'not found' })
      if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
      const conn = bridgeConnections.get(id)
      if (!conn?.bmUrl) return reply.code(503).send({ error: 'board offline' })
      try {
        const tryFetch = (url: string) => fetch(url, { method, headers: { 'Content-Length': '0' } })
        let res = await tryFetch(conn.bmUrl + path)
        if ((res.status === 404 || res.status === 405) && fallback) res = await tryFetch(conn.bmUrl + fallback)
        return reply.code(res.ok ? 200 : res.status).send({ status: res.status })
      } catch (err: any) {
        return reply.code(502).send({ error: err.message })
      }
    })
  }

  app.delete('/api/boards/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const board = await getBoardById(db, id)
    if (!board) return reply.code(404).send({ error: 'not found' })
    if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    try {
      await deleteBoard(db, id)
    } catch (err: any) {
      if (err.code === '23503') return reply.code(409).send({ error: 'board has active sessions' })
      throw err
    }
    return reply.code(204).send()
  })
}
