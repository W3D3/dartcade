import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { createHash, randomBytes } from 'crypto'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { getBoardsByOwner, insertBoard, getBoardById, deleteBoard } from '../db/queries.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

export async function boardsApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts

  app.get('/api/boards', { preHandler: requireAuth }, async (req) => {
    const rows = await getBoardsByOwner(db, req.userId)
    return {
      boards: rows.map(b => {
        const conn = bridgeConnections.get(b.id)
        return {
          id: b.id,
          name: b.name,
          hardwareId: b.hardware_id,
          online: bridgeConnections.isOnline(b.id),
          bridgeVersion: conn?.bmVersion ?? null,
          createdAt: b.created_at,
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
