// Admin-only view of every game on the platform (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { listAllGames, type AdminGame } from '../db/adminGames.js'
import { getFinishedGame } from '../db/history.js'
import { getSessionEvents } from '../db/queries.js'
import { decodeCursor, encodeCursor } from '../history/cursor.js'
import { buildDetail } from '../history/detail.js'
import { ApiError } from './errors.js'
import { toSummary } from './games.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

function serialize(g: AdminGame) {
  return {
    id: g.id,
    mode: g.game_id,
    status: g.status,
    config: g.config,
    createdAt: g.created_at.toISOString(),
    finishedAt: g.finished_at?.toISOString() ?? null,
    board: g.board,
    ranked: g.ranked,
    players: g.seats.map(s => ({
      seat: s.seat,
      name: s.name,
      userId: s.user_id,
      bot: s.bot_level === null ? null : { level: s.bot_level },
      placement: s.placement,
      forfeited: s.forfeited,
    })),
  }
}

/** Every route here is admin-only. */
export function adminGamesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]

  app.get<Route<'listAdminGames'>>('/api/admin/games', { preValidation: adminOnly, schema: fromSpec('listAdminGames') }, async req => {
    const { status = 'finished', mode, player, board, ranked, from, to, limit = 25, cursor } = req.query
    const after = cursor === undefined ? null : decodeCursor(cursor)
    if (cursor !== undefined && after === null) throw new ApiError(400, { error: 'invalid cursor' })
    const page = await listAllGames(
      db,
      {
        status,
        mode,
        player,
        board,
        ranked,
        from: from === undefined ? undefined : new Date(from),
        to: to === undefined ? undefined : new Date(to),
      },
      { limit, after },
    )
    return { games: page.games.map(serialize), nextCursor: page.next ? encodeCursor(page.next) : null }
  })

  app.get<Route<'getAdminGame'>>('/api/admin/games/:id', { preValidation: adminOnly, schema: fromSpec('getAdminGame') }, async req => {
    const game = await getFinishedGame(db, req.params.id)
    if (!game) throw new ApiError(404, { error: 'not found' })
    const built = await buildDetail(game, await getSessionEvents(db, game.id), (message, details) => {
      req.log.warn({ details }, message)
    })
    if (!built) throw new ApiError(404, { error: 'not found' })
    return { game: toSummary(game, true), detail: built.detail, stats: built.stats }
  })

  done()
}
