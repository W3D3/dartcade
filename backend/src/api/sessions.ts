import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { ActiveSessionError, BoardBusyError, type SessionEngine } from '../session/engine.js'
import type { Seat, Session } from '../session/types.js'
import { requireAuth } from '../auth/middleware.js'
import { canAccessSession, isHost } from '../session/access.js'
import { getBoardById, getUsersByIds } from '../db/queries.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { engine: SessionEngine; db: Kysely<Database> }

// The REST API doesn't report 'aborted' sessions separately yet; they read as finished.
const apiStatus = (status: Session['status']): 'active' | 'finished' => status === 'active' ? 'active' : 'finished'

const summary = (s: Session) => ({
  id: s.id, boardId: s.boardId, gameId: s.module.id,
  status: apiStatus(s.status), players: s.players, createdAt: s.createdAt.toISOString(),
})

export function sessionsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { engine, db } = opts

  app.get<Route<'health'>>('/health', { schema: fromSpec('health') }, () => ({ ok: true }))

  app.post<Route<'createSession'>>('/api/sessions', { preValidation: requireAuth, schema: fromSpec('createSession') }, async (req, reply) => {
    const { boardId, gameId, config, players } = req.body
    const resolvedBoardId = boardId || null
    // The seats show the board's name, as they do after a restart (read from the boards table)
    let boardName: string | null = null
    if (resolvedBoardId) {
      const board = await getBoardById(db, resolvedBoardId)
      if (!board) return reply.code(400).send({ error: 'board not found' })
      if (board.owner_user_id !== req.userId) return reply.code(403).send({ error: 'forbidden' })
      boardName = board.name
    }
    // Players with a userId are other accounts: they play from their own device, entering
    // darts by hand, and the seat goes by the account's name
    const accountIds = players.flatMap(p => p.userId ? [p.userId] : [])
    const accounts = new Map((await getUsersByIds(db, accountIds)).map(u => [u.id, u]))
    if (accountIds.some(id => id === req.userId || !accounts.has(id)) || new Set(accountIds).size !== accountIds.length) {
      return reply.code(400).send({ error: 'unknown or repeated player account' })
    }
    let sessionId: string
    try {
      if (accountIds.length === 0) {
        ({ sessionId } = await engine.create(req.userId, resolvedBoardId, gameId, config, players, boardName))
      } else {
        const seats = players.map((p, i): Seat => {
          const account = p.userId ? accounts.get(p.userId) : undefined
          if (account) return { name: account.name, userId: account.id, controllerUserId: account.id, boardId: null, boardName: null }
          return { name: p.name, userId: i === 0 ? req.userId : null, controllerUserId: req.userId, boardId: resolvedBoardId, boardName }
        })
        ;({ sessionId } = await engine.createWithSeats({ ownerUserId: req.userId, gameId, config, seats }))
      }
    } catch (err) {
      // One running game per user (the engine enforces it, also for concurrent creates):
      // point the client at the one they have, or say which player is busy
      if (err instanceof ActiveSessionError) {
        if (err.userId !== req.userId) {
          return reply.code(409).send({ error: `${accounts.get(err.userId)?.name ?? 'A player'} already has a game running` })
        }
        return reply.code(409).send({ error: 'You already have a game running', sessionId: err.sessionId })
      }
      const message = err instanceof Error ? err.message : undefined
      if (message?.includes('unknown game')) return reply.code(400).send({ error: message })
      if (message?.startsWith('invalid config')) return reply.code(400).send({ error: message })
      if (err instanceof BoardBusyError) return reply.code(409).send({ error: err.message })
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
    // Only the host ends the game for everyone
    if (!isHost(req.userId, session)) return reply.code(403).send({ error: 'forbidden' })
    await engine.deleteSession(session.id)
    return reply.code(204).send()
  })

  done()
}
