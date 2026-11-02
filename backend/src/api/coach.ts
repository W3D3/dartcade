import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { ensureCoachGame, ensureCoachLegs } from '../coach/store.js'
import { coachLegsSummary, coachLegsPage, getCoachLeg } from '../coach/legs.js'
import { decodeCoachCursor, encodeCoachCursor } from '../coach/cursor.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** The coach's reviews of the signed-in user's own X01 legs (coach/review.ts). All 404 while
 *  coach.enabled is off for the user. */
export function coachApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const requireCoach = async (userId: string) => {
    if (!(await flagEnabled('coach.enabled', await loadFlagUser(db, userId)))) throw new ApiError(404, { error: 'not found' })
  }

  app.get<Route<'listCoachLegs'>>(
    '/api/coach/legs',
    { preValidation: requireAuth, schema: fromSpec('listCoachLegs') },
    async (req, reply) => {
      await requireCoach(req.userId)
      const { filter = 'all', cursor } = req.query
      const after = cursor === undefined ? null : decodeCoachCursor(cursor)
      if (cursor !== undefined && after === null) return reply.code(400).send({ error: 'invalid cursor' })
      await ensureCoachLegs(db, req.userId, (message, details) => req.log.warn({ details }, message))
      const [summary, page] = await Promise.all([coachLegsSummary(db, req.userId), coachLegsPage(db, req.userId, filter, after)])
      return reply.send({
        counts: summary.counts,
        legs: page.rows.map(r => ({ ...r, finishedAt: r.finishedAt.toISOString() })),
        nextCursor: page.next ? encodeCoachCursor(page.next) : null,
        updatedAt: summary.updatedAt ? summary.updatedAt.toISOString() : null,
      })
    },
  )

  app.get<Route<'getCoachLeg'>>(
    '/api/coach/legs/:gameId/:leg',
    { preValidation: requireAuth, schema: fromSpec('getCoachLeg') },
    async (req, reply) => {
      await requireCoach(req.userId)
      const { gameId, leg } = req.params
      let row = await getCoachLeg(db, req.userId, gameId, leg)
      if (!row) {
        // A leg linked before its game's rows were built (or rebuilt for a new version)
        await ensureCoachGame(db, req.userId, gameId, (message, details) => req.log.warn({ details }, message))
        row = await getCoachLeg(db, req.userId, gameId, leg)
      }
      if (!row) return reply.code(404).send({ error: 'not found' })
      return reply.send({
        review: row.review,
        title: {
          opponents: row.opponents,
          context: row.context,
          finishedAt: row.finishedAt.toISOString(),
          won: row.won,
          winnerName: row.winnerName,
          winnerDarts: row.winnerDarts,
        },
      })
    },
  )

  done()
}
