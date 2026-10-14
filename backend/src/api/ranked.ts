import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getRatings, onlineAverage, ratingChangeSince, recentRanked } from '../db/ranked.js'
import { RANKED_MODES } from '../shared/ranked.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; now?: () => Date }

const DAY = 24 * 60 * 60 * 1000

/** Ranked matchmaking: your ratings, ranks and last ranked games. */
export function rankedApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const now = opts.now ?? (() => new Date())

  app.get<Route<'getMyRanked'>>('/api/ranked/me', { preValidation: requireAuth, schema: fromSpec('getMyRanked') }, async req => {
    const [ratings, change, average, recent] = await Promise.all([
      getRatings(db, req.userId),
      ratingChangeSince(db, req.userId, new Date(now().getTime() - 30 * DAY)),
      onlineAverage(db, req.userId),
      recentRanked(db, req.userId),
    ])
    return {
      // The rating stays hidden until the player is placed
      ratings: RANKED_MODES.map(mode => {
        const r = ratings[mode]
        return { ...r, rating: r.rankIndex === null ? null : r.rating, change30d: change[mode] }
      }),
      onlineAverage: average,
      recent: recent.map(r => ({ ...r, at: r.at.toISOString() })),
    }
  })

  done()
}
