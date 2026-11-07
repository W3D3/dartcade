// Moderating ranked play: void a running ranked game, see the queue and take someone out of it (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireModerator } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { recordVoid } from '../db/adminGames.js'
import type { MatchmakingService } from '../matchmaking/service.js'
import type { SessionEngine } from '../session/engine.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  engine: Pick<SessionEngine, 'getSession' | 'voidSession'>
  matchmaking: Pick<MatchmakingService, 'searchList' | 'dequeue'>
}

/** Every route here is for admins and moderators. */
export function adminRankedApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, engine, matchmaking } = opts
  const moderatorOnly = [requireAuth, requireModerator]

  app.post<Route<'voidAdminGame'>>(
    '/api/admin/games/:id/void',
    { preValidation: moderatorOnly, schema: fromSpec('voidAdminGame') },
    async (req, reply) => {
      const session = engine.getSession(req.params.id)
      if (!session) throw new ApiError(404, { error: 'not found' })
      if (!session.ranked || session.status !== 'active') throw new ApiError(409, { error: 'Only a running ranked game can be voided' })
      // False when the game finished or ended first, behind the input that did it: nothing to void
      if (!(await engine.voidSession(session.id))) throw new ApiError(409, { error: 'Only a running ranked game can be voided' })
      await recordVoid(db, req.userId, session.id, req.body.reason?.trim() || null)
      req.log.info({ gameId: session.id, moderatorId: req.userId }, 'moderator voided ranked game')
      return reply.code(204).send()
    },
  )

  app.get<Route<'listRankedQueue'>>(
    '/api/admin/ranked/queue',
    { preValidation: moderatorOnly, schema: fromSpec('listRankedQueue') },
    () => ({ searches: matchmaking.searchList() }),
  )

  app.post<Route<'removeFromRankedQueue'>>(
    '/api/admin/ranked/queue/:userId/remove',
    { preValidation: moderatorOnly, schema: fromSpec('removeFromRankedQueue') },
    async (req, reply) => {
      const removed = await matchmaking.dequeue(req.params.userId)
      if (!removed) throw new ApiError(404, { error: 'not in the queue' })
      await db
        .insertInto('admin_audit')
        .values({
          admin_user_id: req.userId,
          action: 'ranked.dequeue',
          target: req.params.userId,
          detail: JSON.stringify({ mode: removed.mode, userIds: removed.userIds, reason: req.body.reason?.trim() || null }),
        })
        .execute()
      req.log.info({ targetId: req.params.userId, moderatorId: req.userId }, 'moderator removed user from ranked queue')
      return reply.code(204).send()
    },
  )

  done()
}
