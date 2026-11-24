// The admin Activity page's data: counts from the tables plus what is live in memory (schema/api-v1.yaml, getAdminActivity).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { activityDrill, activityStats } from '../db/adminActivity.js'
import type { components } from '../schema/api.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Drill = components['schemas']['AdminActivityDrill']
type Activity = components['schemas']['AdminActivity']
type Live = {
  online: number
  /** Running games per game id. */
  runningGames: Record<string, number>
  rankedQueue: number
  openLobbies: number
  bridges: number
  boardsOnline: number
}

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  live: () => Promise<Live>
  now?: () => number
}

/** The table counts change slowly and cost scans: one answer per range is reused for this long. */
export const CACHE_MS = 15_000

/** A drill-down looks at one chart point, a bucket of at most a month, or the heatmap's four weeks. */
const MAX_DRILL_SPAN_MS = 40 * 86_400_000

export function adminActivityApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, live, now = Date.now } = opts
  const cache = new Map<number, { at: number; stats: Promise<Awaited<ReturnType<typeof activityStats>>> }>()

  function stats(days: number) {
    const hit = cache.get(days)
    if (hit && now() - hit.at < CACHE_MS) return hit.stats
    const entry = { at: now(), stats: activityStats(db, days, now()) }
    cache.set(days, entry)
    // A failed query is not kept
    entry.stats.catch(() => cache.delete(days))
    return entry.stats
  }

  app.get<Route<'getAdminActivity'>>(
    '/api/admin/activity',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('getAdminActivity') },
    async (req): Promise<Activity> => {
      const days = req.query.days ?? 30
      const [s, l] = await Promise.all([stats(days), live()])
      const { tournaments, manualDartShare, ...rest } = s
      return {
        generatedAt: new Date(now()).toISOString(),
        live: { online: l.online, runningGames: Object.values(l.runningGames).reduce((a, b) => a + b, 0) },
        ...rest,
        happeningNow: { tournaments, rankedQueue: l.rankedQueue, openLobbies: l.openLobbies, runningGames: l.runningGames },
        health: { bridges: l.bridges, boardsOnline: l.boardsOnline, manualDartShare },
      }
    },
  )

  app.get<Route<'getAdminActivityDrill'>>(
    '/api/admin/activity/drill',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('getAdminActivityDrill') },
    async (req, reply): Promise<Drill> => {
      const { metric, from, to, mode, dow, hour, limit = 50, offset = 0 } = req.query
      const [start, end] = [new Date(from), new Date(to)]
      if (!(start < end) || end.getTime() - start.getTime() > MAX_DRILL_SPAN_MS) return reply.code(400).send({ error: 'invalid range' })
      return activityDrill(db, { metric, from: start, to: end, mode, dow, hour, limit, offset })
    },
  )

  done()
}
