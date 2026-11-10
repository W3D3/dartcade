import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { listAchievements, markSeen, setShowcase } from '../db/achievements.js'
import { profileUser } from '../db/profile.js'
import { achievement, SHOWCASE_SIZE } from '../shared/achievements.js'
import { ApiError, notFound } from './errors.js'
import { requireFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Achievements: yours, another player's, the showcase. All 404 while achievements.enabled is off for you. */
export function achievementsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const requireAchievements = (userId: string) => requireFlag(db, 'achievements.enabled', userId)

  const view = async (userId: string, self: boolean) => {
    const rows = await listAchievements(db, userId)
    return {
      achievements: rows
        .filter(r => achievement(r.id))
        .map(r => ({
          id: r.id,
          count: r.count,
          tier: r.tier,
          earnedAt: r.earnedAt?.toISOString() ?? null,
          tierAt: r.tierAt?.toISOString() ?? null,
          isNew: self && r.tier > r.seenTier,
        })),
      showcase: rows
        .filter(r => r.showcaseSlot !== null && r.tier > 0)
        .sort((a, b) => (a.showcaseSlot ?? 0) - (b.showcaseSlot ?? 0))
        .map(r => r.id),
      unseen: self ? rows.filter(r => r.tier > r.seenTier).length : 0,
    }
  }

  app.get<Route<'getMyAchievements'>>(
    '/api/achievements',
    { preValidation: requireAuth, schema: fromSpec('getMyAchievements') },
    async req => {
      await requireAchievements(req.userId)
      return view(req.userId, true)
    },
  )

  app.put<Route<'setAchievementShowcase'>>(
    '/api/achievements/showcase',
    { preValidation: requireAuth, schema: fromSpec('setAchievementShowcase') },
    async req => {
      await requireAchievements(req.userId)
      const { ids } = req.body
      if (ids.length > SHOWCASE_SIZE || new Set(ids).size !== ids.length) throw new ApiError(400, { error: 'bad showcase' })
      const earned = new Set((await listAchievements(db, req.userId)).filter(r => r.tier > 0).map(r => r.id))
      if (!ids.every(id => earned.has(id))) throw new ApiError(400, { error: 'only earned achievements can be shown' })
      await setShowcase(db, req.userId, ids)
      return view(req.userId, true)
    },
  )

  app.post<Route<'markAchievementsSeen'>>(
    '/api/achievements/seen',
    { preValidation: requireAuth, schema: fromSpec('markAchievementsSeen') },
    async (req, reply) => {
      await requireAchievements(req.userId)
      await markSeen(db, req.userId)
      return reply.code(204).send()
    },
  )

  app.get<Route<'getPlayerAchievements'>>(
    '/api/users/:id/achievements',
    { preValidation: requireAuth, schema: fromSpec('getPlayerAchievements') },
    async req => {
      await requireAchievements(req.userId)
      if (!(await profileUser(db, req.params.id))) throw notFound()
      return view(req.params.id, req.params.id === req.userId)
    },
  )

  done()
}
