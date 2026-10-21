import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import { gameLines, getProgress, getStreak, lockUser, streakDays, userTimeZone } from '../db/progression.js'
import { xpLine } from '../progression/service.js'
import { addDays, levelOf, localDate } from '../shared/progression.js'
import { dayStreak } from '../progression/view.js'
import { challengesView, ensureSets, reroll } from '../progression/challengeSets.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Progression: your XP, level and day streak, what a game paid you, your challenges. All 404 while progression.enabled is off for you. */
export function progressApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const requireProgression = async (userId: string) => {
    if (!(await flagEnabled('progression.enabled', await loadFlagUser(db, userId)))) throw new ApiError(404, { error: 'not found' })
  }

  app.get<Route<'getMyProgress'>>('/api/progress/me', { preValidation: requireAuth, schema: fromSpec('getMyProgress') }, async req => {
    await requireProgression(req.userId)
    const today = localDate(new Date(), await userTimeZone(db, req.userId))
    const [{ xp }, streak, days, sets] = await Promise.all([
      getProgress(db, req.userId),
      getStreak(db, req.userId),
      streakDays(db, req.userId, addDays(today, -6), today),
      ensureSets(db, req.userId, today),
    ])
    return {
      xp,
      level: levelOf(xp).level,
      streak: dayStreak(streak, today, days.played, days.frozen),
      dailyOpen: sets.daily.filter(c => c.completedAt === null).length,
    }
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

  app.get<Route<'getChallenges'>>('/api/challenges', { preValidation: requireAuth, schema: fromSpec('getChallenges') }, async req => {
    await requireProgression(req.userId)
    const zone = await userTimeZone(db, req.userId)
    return challengesView(db, req.userId, localDate(new Date(), zone), zone)
  })

  app.post<Route<'rerollChallenge'>>(
    '/api/challenges/:id/reroll',
    { preValidation: requireAuth, schema: fromSpec('rerollChallenge') },
    async req => {
      await requireProgression(req.userId)
      const zone = await userTimeZone(db, req.userId)
      const today = localDate(new Date(), zone)
      // One reroll a day: two at once must not both get one
      const result = await db.transaction().execute(async trx => {
        await lockUser(trx, req.userId)
        return reroll(trx, req.userId, req.params.id, today)
      })
      if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
      if (result === 'not-allowed') throw new ApiError(409, { error: 'this challenge cannot be rerolled' })
      return challengesView(db, req.userId, today, zone)
    },
  )

  done()
}
