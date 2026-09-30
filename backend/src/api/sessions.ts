import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { games } from '../games/index.js'
import { ActiveSessionError, type SessionEngine } from '../session/engine.js'
import type { Session } from '../session/types.js'
import { requireAuth } from '../auth/middleware.js'
import { getBoardById } from '../db/queries.js'

type Opts = FastifyPluginOptions & { engine: SessionEngine; db: Kysely<Database> }

/** Only the user who started a session can see or act on it. */
export function canAccessSession(userId: string, session: Session): boolean {
  return session.ownerUserId === userId
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
      const { sessionId } = await engine.create(req.userId, resolvedBoardId, gameId, config, players)
      return reply.code(201).send({ sessionId })
    } catch (err: any) {
      // One running game per user: point the client at the one they have
      if (err instanceof ActiveSessionError) {
        return reply.code(409).send({ error: 'You already have a game running', sessionId: err.sessionId })
      }
      // Unique index game_sessions_one_active_per_owner as a backstop
      if (err.code === '23505') return reply.code(409).send({ error: 'You already have a game running' })
      if (err.message?.includes('unknown game')) return reply.code(400).send({ error: err.message })
      if (err.message?.startsWith('invalid config')) return reply.code(400).send({ error: err.message })
      if (err.message?.includes('active session')) return reply.code(409).send({ error: err.message })
      return reply.code(500).send({ error: 'internal error' })
    }
  })

  app.get('/api/sessions', { preHandler: requireAuth }, async (req) => {
    return {
      sessions: engine.getAllSessions()
        .filter(s => canAccessSession(req.userId, s))
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
    if (!canAccessSession(req.userId, session)) return reply.code(403).send({ error: 'forbidden' })
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
    if (!canAccessSession(req.userId, session)) return reply.code(403).send({ error: 'forbidden' })
    await engine.deleteSession(id)
    return reply.code(204).send()
  })
}
