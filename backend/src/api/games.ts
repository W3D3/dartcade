import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import { gameList } from '../games/index.js'
import { requireAuth } from '../auth/middleware.js'
import { listFinishedGames, getStatRows, getViewableGame, type HistoryGame } from '../db/history.js'
import { getSessionEvents } from '../db/queries.js'
import { decodeCursor, encodeCursor } from '../history/cursor.js'
import { aggregateStats } from '../history/stats.js'
import { buildDetail } from '../history/detail.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }
type GameSummary = components['schemas']['GameSummary']

const DAY_MS = 86_400_000

/** The API shape of a game; account ids only for someone who holds a seat. */
export function toSummary(g: HistoryGame): GameSummary {
  return {
    id: g.id, mode: g.game_id, config: g.config,
    createdAt: g.created_at.toISOString(), finishedAt: g.finished_at.toISOString(),
    board: g.board, mySeat: g.mySeat,
    players: g.seats.map(s => ({ seat: s.seat, name: s.name, userId: g.mySeat === null ? null : s.user_id, placement: s.placement, throwPosition: s.throw_position, stats: s.stats })),
  }
}

export function gamesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'listGameModes'>>('/api/gamemodes', { schema: fromSpec('listGameModes') }, () => ({
    modes: gameList.map(m => ({ id: m.id, defaultConfig: m.defaultConfig, configMeta: m.configMeta ?? {} })),
  }))

  app.get<Route<'listGames'>>('/api/games', { preValidation: requireAuth, schema: fromSpec('listGames') }, async (req, reply) => {
    const { mode, limit = 25, cursor } = req.query
    const after = cursor === undefined ? null : decodeCursor(cursor)
    if (cursor !== undefined && after === null) return reply.code(400).send({ error: 'invalid cursor' })
    const page = await listFinishedGames(db, req.userId, { mode, limit, after })
    return reply.send({ games: page.games.map(toSummary), nextCursor: page.next ? encodeCursor(page.next) : null })
  })

  app.get<Route<'getGameStats'>>('/api/games/stats', { preValidation: requireAuth, schema: fromSpec('getGameStats') }, async (req) => {
    const days = req.query.days ?? 30
    const now = new Date()
    // Twice the period: the earlier half is the comparison (previousAvg)
    const rows = await getStatRows(db, req.userId, new Date(now.getTime() - 2 * days * DAY_MS))
    return aggregateStats(rows, days, now)
  })

  app.get<Route<'getGame'>>('/api/games/:id', { preValidation: requireAuth, schema: fromSpec('getGame') }, async (req, reply) => {
    const game = await getViewableGame(db, req.params.id, req.userId)
    if (!game) return reply.code(404).send({ error: 'not found' })
    const detail = buildDetail(game, await getSessionEvents(db, game.id), (message, details) => { req.log.warn({ details }, message) })
    if (!detail) return reply.code(404).send({ error: 'not found' })
    return reply.send({ game: toSummary(game), detail })
  })

  done()
}
