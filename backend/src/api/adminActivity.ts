// The admin Activity page's data: counts from the tables plus what is live in memory (schema/api-v1.yaml, getAdminActivity).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { activityDrill, activityStats } from '../db/adminActivity.js'
import {
  activityGamesOverTime,
  listActivityGames,
  namesOf,
  type ActivityGameRow,
  type ActivityGamesFilter,
} from '../db/adminActivityGames.js'
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

export const GAMES_PAGE_SIZE = 25
/** The CSV stops here; the page warns beside Export CSV when the filter matches more (`csvMax` in the answer). */
export const CSV_MAX_ROWS = 50_000

const csvList = (v: string | undefined): string[] => [
  ...new Set(
    (v ?? '')
      .split(',')
      .map(x => x.trim())
      .filter(x => x !== ''),
  ),
]

type GamesQuery = Route<'listAdminActivityGames'>['Querystring']

function gamesFilter(q: GamesQuery): ActivityGamesFilter {
  return {
    usersIn: csvList(q.usersIn),
    usersOut: csvList(q.usersOut),
    countriesIn: csvList(q.countriesIn),
    countriesOut: csvList(q.countriesOut),
    countryMatch: q.countryMatch ?? 'any',
    minPlayers: q.minPlayers,
    maxPlayers: q.maxPlayers,
    modes: csvList(q.modes),
    kind: q.kind ?? 'any',
    status: q.status ?? 'finished',
    from: q.from === undefined ? undefined : new Date(q.from),
    to: q.to === undefined ? undefined : new Date(q.to),
    includeInvalidated: q.includeInvalidated ?? false,
  }
}

const serializeGame = (g: ActivityGameRow) => ({
  id: g.id,
  mode: g.mode,
  status: g.status,
  createdAt: g.createdAt.toISOString(),
  finishedAt: g.finishedAt?.toISOString() ?? null,
  ranked: g.ranked,
  invalidated: g.invalidated,
  players: g.players,
})

/** A CSV field: quoted when it holds a comma, quote or line break; a leading = + - @ is defused against spreadsheet formulas. */
const csvField = (v: string): string => {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
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

  app.get<Route<'listAdminActivityGames'>>(
    '/api/admin/activity/games',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('listAdminActivityGames') },
    async req => {
      const filter = gamesFilter(req.query)
      const page = req.query.page ?? 1
      const [over, games, users] = await Promise.all([
        activityGamesOverTime(db, filter, now()),
        listActivityGames(db, filter, { offset: (page - 1) * GAMES_PAGE_SIZE, limit: GAMES_PAGE_SIZE }),
        namesOf(db, [...filter.usersIn, ...filter.usersOut]),
      ])
      return {
        total: over.total,
        page,
        pageSize: GAMES_PAGE_SIZE,
        csvMax: CSV_MAX_ROWS,
        perDay: over.perDay,
        games: games.map(serializeGame),
        users,
      }
    },
  )

  app.get<Route<'exportAdminActivityGames'>>(
    '/api/admin/activity/games.csv',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('exportAdminActivityGames') },
    async (req, reply) => {
      const games = await listActivityGames(db, gamesFilter(req.query), { offset: 0, limit: CSV_MAX_ROWS })
      const head = 'id,mode,status,started_at,finished_at,ranked,invalidated,players,countries'
      const lines = games.map(g =>
        [
          g.id,
          g.mode,
          g.status,
          g.createdAt.toISOString(),
          g.finishedAt?.toISOString() ?? '',
          String(g.ranked),
          String(g.invalidated),
          g.players.map(p => p.name).join(' | '),
          g.players.map(p => p.country ?? '').join(' | '),
        ]
          .map(csvField)
          .join(','),
      )
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="games.csv"')
        .send(Buffer.from([head, ...lines].join('\n') + '\n'))
    },
  )

  done()
}
