import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { listStatGames } from '../db/history.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { storedDetails } from '../history/detail.js'
import { x01Legs } from '../stats/x01Legs.js'
import { x01StatsFor } from '../stats/x01Stats.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** The Stats page (stats.enabled): the signed-in user's own numbers, read from their games' stored details. */
export function statsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'getX01Stats'>>('/api/stats/x01', { preValidation: requireAuth, schema: fromSpec('getX01Stats') }, async (req, reply) => {
    if (!(await flagEnabled('stats.enabled', await loadFlagUser(db, req.userId)))) throw new ApiError(404, { error: 'not found' })
    const list = await listStatGames(db, req.userId, 'x01')
    const built = await storedDetails(db, list, (message, details) => req.log.warn({ details }, message))
    // Games come newest first; so do their legs
    const legs = list.flatMap((game, i) => {
      const detail = built[i]?.detail
      return detail?.mode === 'x01' && game.mySeat !== null ? x01Legs(game, detail, game.mySeat, game.ranked).reverse() : []
    })
    return reply.send(x01StatsFor(legs, req.query, new Date()))
  })

  done()
}
