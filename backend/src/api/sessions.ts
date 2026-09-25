import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { games } from '../games/index.js'
import type { SessionEngine } from '../session/engine.js'
import { bridgeConnections } from '../bridge-gw/handler.js'

type Opts = FastifyPluginOptions & { engine: SessionEngine }

export async function sessionsApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { engine } = opts

  app.get('/health', async () => ({ ok: true }))

  app.get('/api/boards', async () => ({
    boards: bridgeConnections.connectedBoardIds(),
  }))

  app.get('/api/games', async () => ({
    games: Object.values(games).map(m => ({ id: m.id, defaultConfig: m.defaultConfig })),
  }))

  app.post('/api/sessions', async (req, reply) => {
    const { boardId, gameId, config, players } = req.body as any
    try {
      const { sessionId } = await engine.create(boardId, gameId, config, players)
      return reply.code(201).send({ sessionId })
    } catch (err: any) {
      if (err.message?.includes('unknown game')) return reply.code(400).send({ error: err.message })
      if (err.message?.includes('active session')) return reply.code(409).send({ error: err.message })
      return reply.code(500).send({ error: 'internal error' })
    }
  })

  app.get('/api/sessions', async () => ({
    sessions: engine.getAllSessions().map(s => ({
      id: s.id, boardId: s.boardId, gameId: s.module.id,
      status: s.status, players: s.players, createdAt: s.createdAt,
    })),
  }))

  app.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as any
    const session = engine.getSession(id)
    if (!session) return reply.code(404).send({ error: 'not found' })
    const snap = engine.getSnapshot(id)
    return {
      id: session.id, boardId: session.boardId, gameId: session.module.id,
      status: session.status, players: session.players, createdAt: session.createdAt,
      game: snap?.game ?? null,
    }
  })

  app.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as any
    const deleted = await engine.deleteSession(id)
    return deleted ? reply.code(204).send() : reply.code(404).send({ error: 'not found' })
  })
}
