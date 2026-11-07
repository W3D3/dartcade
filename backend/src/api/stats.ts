import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { countX01StatLegs, listX01StatGames, x01StatOptions } from '../db/history.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { storedDetails } from '../history/detail.js'
import { isOutMode, x01Legs } from '../stats/x01Legs.js'
import { gamesFor, x01Report } from '../stats/x01Stats.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** The Stats page (stats.enabled): the signed-in user's own numbers. The database picks the games
 *  (the filters, and only as many as the range needs); their stored details give the darts. */
export function statsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'getX01Stats'>>('/api/stats/x01', { preValidation: requireAuth, schema: fromSpec('getX01Stats') }, async (req, reply) => {
    if (!(await flagEnabled('stats.enabled', await loadFlagUser(db, req.userId)))) throw new ApiError(404, { error: 'not found' })
    const { range = 'legs50', kind = 'all' } = req.query
    const now = new Date()
    const played = await x01StatOptions(db, req.userId)
    const outModes = played.outs.filter(isOutMode)
    // A filter left out is the one played most
    const start = req.query.start ?? played.starts.at(0) ?? null
    const out = req.query.out ?? outModes.at(0) ?? null
    const options = { starts: [...played.starts].sort((a, b) => a - b), outModes }
    if (start === null || out === null) {
      return reply.send({ options, applied: { range, start, out, kind }, totalLegs: 0, ...x01Report([], range, now) })
    }
    const filter = { start, out, kind }
    const list = await listX01StatGames(db, req.userId, filter, gamesFor(range, now))
    const built = await storedDetails(db, list, (message, details) => req.log.warn({ details }, message))
    // Counted from the stored details: after the range's games have theirs
    const totalLegs = await countX01StatLegs(db, req.userId, filter)
    // Games come newest first; so do their legs
    const legs = list.flatMap((game, i) => {
      const detail = built[i]?.detail
      return detail?.mode === 'x01' && game.mySeat !== null ? x01Legs(game, detail, game.mySeat).reverse() : []
    })
    return reply.send({ options, applied: { range, start, out, kind }, totalLegs, ...x01Report(legs, range, now) })
  })

  done()
}
