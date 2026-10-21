import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getRankedProfile } from '../db/ranked.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; now?: () => Date }

/** Ranked matchmaking: your ratings, ranks and last ranked games. */
export function rankedApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const now = opts.now ?? (() => new Date())

  app.get<Route<'getMyRanked'>>('/api/ranked/me', { preValidation: requireAuth, schema: fromSpec('getMyRanked') }, async req =>
    getRankedProfile(db, req.userId, now()),
  )

  done()
}
