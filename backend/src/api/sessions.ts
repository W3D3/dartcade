import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { pgErrorCode } from '../db/errors.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { gameList } from '../games/index.js'
import { ActiveSessionError, type SessionEngine } from '../session/engine.js'
import type { Session } from '../session/types.js'
import { requireAuth } from '../auth/middleware.js'
import { getBoardById } from '../db/queries.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { engine: SessionEngine; db: Kysely<Database> }

/** Only the user who started a session can see or act on it. */
export function canAccessSession(userId: string, session: Session): boolean {
  return session.ownerUserId === userId
}

const summary = (s: Session) => ({
  id: s.id, boardId: s.boardId, gameId: s.module.id,
  status: s.status, players: s.players, createdAt: s.createdAt.toISOString(),
})

export function sessionsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine, db } = opts

  app.get<Route<'health'>>('/health', { schema: fromSpec('health') }, () => ({ ok: true }))

  app.get<Route<'listGames'>>('/api/games', { schema: fromSpec('listGames') }, () => ({
    games: gameList.map(m => ({
      id: m.id,
      defaultConfig: m.defaultConfig,
      configMeta: m.configMeta ?? {},
    })),
  }))

  app.post<Route<'createSession'>>('/api/sessions', { preValidation: requireAuth, schema: fromSpec('createSession') }, async (req, reply) => {
    const { boardId, gameId, config, players } = req.body
    const resolvedBoardId = boardId || null
    if (resolvedBoardId) {
      const board = await getBoardById(db, resolvedBoardId)
      if (!board) return reply.code(400).send({ error: 'board not found' })
      if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
    }
    let sessionId: string
    try {
      ({ sessionId } = await engine.create(req.userId, resolvedBoardId, gameId, config, players))
    } catch (err) {
      // One running game per user: point the client at the one they have
      if (err instanceof ActiveSessionError) {
        return reply.code(409).send({ error: 'You already have a game running', sessionId: err.sessionId })
      }
      // Unique index game_sessions_one_active_per_owner as a backstop
      if (pgErrorCode(err) === '23505') return reply.code(409).send({ error: 'You already have a game running' })
      const message = err instanceof Error ? err.message : undefined
      if (message?.includes('unknown game')) return reply.code(400).send({ error: message })
      if (message?.startsWith('invalid config')) return reply.code(400).send({ error: message })
      if (message?.includes('active session')) return reply.code(409).send({ error: message })
      throw err
    }
    return reply.code(201).send({ sessionId })
  })

  app.get<Route<'listSessions'>>('/api/sessions', { preValidation: requireAuth, schema: fromSpec('listSessions') }, (req) => ({
    sessions: engine.getAllSessions().filter(s => canAccessSession(req.userId, s)).map(summary),
  }))

  app.get<Route<'getSession'>>('/api/sessions/:id', { preValidation: requireAuth, schema: fromSpec('getSession') }, async (req, reply) => {
    const session = engine.getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (!canAccessSession(req.userId, session)) return reply.code(403).send({ error: 'forbidden' })
    const snap = engine.getSnapshot(session.id)
    return reply.send({ ...summary(session), game: snap ? { ...snap.game } : null })
  })

  app.delete<Route<'deleteSession'>>('/api/sessions/:id', { preValidation: requireAuth, schema: fromSpec('deleteSession') }, async (req, reply) => {
    const session = engine.getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'not found' })
    if (!canAccessSession(req.userId, session)) return reply.code(403).send({ error: 'forbidden' })
    await engine.deleteSession(session.id)
    return reply.code(204).send()
  })

  done()
}
