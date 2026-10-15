import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { MatchmakingError, type MatchmakingService } from '../matchmaking/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; matchmaking: MatchmakingService }

/**
 * The ranked queue: start and cancel a search, accept or decline a found match. What the search
 * is doing is pushed on /ws/me (a matchmaking message), not returned here.
 */
export function matchmakingApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, matchmaking } = opts

  // Only for whoever has matchmaking (its flag); cancelling, accepting and declining stay open
  // so a search started before the flag went off can still end
  const assertFlagOn = async (userId: string) => {
    if (!(await flagEnabled('matchmaking.enabled', await loadFlagUser(db, userId)))) {
      throw MatchmakingError.forbidden("Matchmaking isn't available yet")
    }
  }

  app.post<Route<'startRankedSearch'>>(
    '/api/matchmaking/search',
    { preValidation: requireAuth, schema: fromSpec('startRankedSearch') },
    async (req, reply) => {
      await assertFlagOn(req.userId)
      await matchmaking.search(req.userId, req.body)
      return reply.code(204).send()
    },
  )

  app.delete<Route<'cancelRankedSearch'>>(
    '/api/matchmaking/search',
    { preValidation: requireAuth, schema: fromSpec('cancelRankedSearch') },
    async (req, reply) => {
      await matchmaking.cancel(req.userId)
      return reply.code(204).send()
    },
  )

  app.post<Route<'acceptRankedMatch'>>(
    '/api/matchmaking/matches/:matchId/accept',
    { preValidation: requireAuth, schema: fromSpec('acceptRankedMatch') },
    async (req, reply) => {
      await matchmaking.accept(req.userId, req.params.matchId)
      return reply.code(204).send()
    },
  )

  app.post<Route<'declineRankedMatch'>>(
    '/api/matchmaking/matches/:matchId/decline',
    { preValidation: requireAuth, schema: fromSpec('declineRankedMatch') },
    async (req, reply) => {
      await matchmaking.decline(req.userId, req.params.matchId)
      return reply.code(204).send()
    },
  )

  done()
}
