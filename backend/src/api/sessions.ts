import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { games } from '../games/index.js'
import type { SessionEngine } from '../session/engine.js'
import { requireAuth } from '../auth/middleware.js'
import { getBoardById, getBoardsByOwner } from '../db/queries.js'

type Opts = FastifyPluginOptions & { engine: SessionEngine; db: Kysely<Database> }

async function canAccessSession(
  db: Kysely<Database>,
  userId: string,
  boardId: string | null,
): Promise<boolean> {
  if (!boardId) return true
  const board = await getBoardById(db, boardId)
  return board?.owner_user_id === userId
}

export async function sessionsApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine, db } = opts

  app.get('/health', async () => ({ ok: true }))

  app.get('/api/games', async () => ({
    games: Object.values(games).map(m => ({
      id: m.id,
      defaultConfig: m.defaultConfig,
      configMeta: m.configMeta ?? {},
    })),
  }))

  app.post('/api/sessions', { preHandler: requireAuth }, async (req, reply) => {
    const { boardId, gameId, config, players } = req.body as any
    const resolvedBoardId: string | null = boardId || null
    if (resolvedBoardId) {
      const board = await getBoardById(db, resolvedBoardId)
      if (!board) return reply.code(400).send({ error: 'board not found' })
      if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    }
    try {
      const { sessionId } = await engine.create(resolvedBoardId, gameId, config, players)
      return reply.code(201).send({ sessionId })
    } catch (err: any) {
      if (err.message?.includes('unknown game')) return reply.code(400).send({ error: err.message })
      if (err.message?.includes('active session')) return reply.code(409).send({ error: err.message })
      return reply.code(500).send({ error: 'internal error' })
    }
  })

  app.get('/api/sessions', { preHandler: requireAuth }, async (req) => {
    const userBoards = await getBoardsByOwner(db, req.userId)
    const ownedBoardIds = new Set(userBoards.map(b => b.id))
    return {
      sessions: engine.getAllSessions()
        .filter(s => !s.boardId || ownedBoardIds.has(s.boardId))
        .map(s => ({
          id: s.id, boardId: s.boardId, gameId: s.module.id,
          status: s.status, players: s.players, createdAt: s.createdAt,
        })),
    }
  })

  app.get('/api/sessions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as any
    const session = engine.getSession(id)
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (!await canAccessSession(db, req.userId, session.boardId)) return reply.code(403).send({ error: 'forbidden' })
    const snap = engine.getSnapshot(id)
    return {
      id: session.id, boardId: session.boardId, gameId: session.module.id,
      status: session.status, players: session.players, createdAt: session.createdAt,
      game: snap?.game ?? null,
    }
  })

  app.delete('/api/sessions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as any
    const session = engine.getSession(id)
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (!await canAccessSession(db, req.userId, session.boardId)) return reply.code(403).send({ error: 'forbidden' })
    await engine.deleteSession(id)
    return reply.code(204).send()
  })
}
