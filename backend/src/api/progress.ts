import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { gameLines, getProgress, getStreak, streakDays, userTimeZone } from '../db/progression.js'
import { xpLine } from '../progression/service.js'
import { addDays, levelOf, localDate } from '../shared/progression.js'
import { dayStreak } from '../progression/view.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Progression: your XP and level, and what a game paid you. All 404 while progression.enabled is off for you. */
export function progressApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const requireProgression = async (userId: string) => {
    if (!(await flagEnabled('progression.enabled', await loadFlagUser(db, userId)))) throw new ApiError(404, { error: 'not found' })
  }

  app.get<Route<'getMyProgress'>>('/api/progress/me', { preValidation: requireAuth, schema: fromSpec('getMyProgress') }, async req => {
    await requireProgression(req.userId)
    const today = localDate(new Date(), await userTimeZone(db, req.userId))
    const [{ xp }, streak, days] = await Promise.all([
      getProgress(db, req.userId),
      getStreak(db, req.userId),
      streakDays(db, req.userId, addDays(today, -6), today),
    ])
    return { xp, level: levelOf(xp).level, streak: dayStreak(streak, today, days.played, days.frozen) }
  })

  app.get<Route<'getGameXp'>>('/api/progress/games/:id', { preValidation: requireAuth, schema: fromSpec('getGameXp') }, async req => {
    await requireProgression(req.userId)
    const rows = await gameLines(db, req.userId, req.params.id)
    if (rows.length === 0) throw new ApiError(404, { error: 'not found' })
    const { xp } = await getProgress(db, req.userId)
    return {
      lines: rows.filter(r => r.amount > 0).map(xpLine),
      total: rows.reduce((a, r) => a + r.amount, 0),
      xp,
    }
  })

  done()
}
