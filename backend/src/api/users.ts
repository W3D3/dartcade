import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getAuthUser } from '../auth/session.js'
import { getProfileUser, searchUsers } from '../db/queries.js'
import { friendshipBetween } from '../db/friends.js'
import { getStatRows, headToHead, listFinishedGames } from '../db/history.js'
import { getRankedProfile } from '../db/ranked.js'
import { aggregateStats, type StatRow } from '../history/stats.js'
import { checkName } from '../users/account.js'
import type { FriendsService } from '../friends/service.js'
import { toSummary } from './games.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; friends: FriendsService; now?: () => Date }

const DAY_MS = 24 * 60 * 60 * 1000
const PROFILE_STATS_DAYS = 30

/** Share of `rows` per game mode, highest first; [] without any. */
function playsMost(rows: StatRow[]): { mode: string; pct: number }[] {
  if (rows.length === 0) return []
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.mode, (counts.get(r.mode) ?? 0) + 1)
  return [...counts.entries()].map(([mode, n]) => ({ mode, pct: Math.round((n / rows.length) * 100) })).sort((a, b) => b.pct - a.pct)
}

/** Other accounts, to add to a game as players. */
export function usersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, friends } = opts
  const now = opts.now ?? (() => new Date())

  app.get<Route<'searchUsers'>>('/api/users', { preValidation: requireAuth, schema: fromSpec('searchUsers') }, async req => ({
    users: await searchUsers(db, req.query.q, req.userId),
  }))

  app.get<Route<'getUserProfile'>>(
    '/api/users/:id/profile',
    { preValidation: requireAuth, schema: fromSpec('getUserProfile') },
    async (req, reply) => {
      const target = await getProfileUser(db, req.params.id)
      if (!target) return reply.code(404).send({ error: 'not found' })
      const viewerId = req.userId
      const isSelf = target.id === viewerId
      const friendship = isSelf ? undefined : await friendshipBetween(db, viewerId, target.id)
      const relation: { kind: 'self' | 'friend' | 'incoming' | 'outgoing' | 'none'; requestId: string | null } = isSelf
        ? { kind: 'self', requestId: null }
        : !friendship
          ? { kind: 'none', requestId: null }
          : friendship.status === 'accepted'
            ? { kind: 'friend', requestId: null }
            : { kind: friendship.requester_id === viewerId ? 'outgoing' : 'incoming', requestId: friendship.id }
      // Full stats go to yourself or a friend; anyone else sees identity and the relationship only
      const canSeeStats = isSelf || relation.kind === 'friend'
      const nowVal = now()
      const [rows, recent, ranked, h2h] = await Promise.all([
        canSeeStats ? getStatRows(db, target.id, new Date(nowVal.getTime() - 2 * PROFILE_STATS_DAYS * DAY_MS)) : Promise.resolve([]),
        canSeeStats ? listFinishedGames(db, target.id, { limit: 6, after: null }) : Promise.resolve(null),
        canSeeStats ? getRankedProfile(db, target.id, nowVal) : Promise.resolve(null),
        isSelf ? Promise.resolve(null) : headToHead(db, viewerId, target.id),
      ])
      return {
        id: target.id,
        name: target.name,
        createdAt: target.createdAt.toISOString(),
        isSelf,
        relation,
        online: canSeeStats ? friends.isOnline(target.id) && !target.invisible : null,
        ranked,
        stats: canSeeStats ? aggregateStats(rows, PROFILE_STATS_DAYS, nowVal) : null,
        recentMatches: recent ? recent.games.map(g => toSummary(g, true)) : null,
        playsMost: canSeeStats ? playsMost(rows) : null,
        headToHead: h2h,
      }
    },
  )

  // Public: the sign-up page asks before an account exists. Signed in, your own name is free.
  app.get<Route<'checkNameAvailable'>>(
    '/api/users/name-available',
    {
      schema: fromSpec('checkNameAvailable'),
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async req => {
      const self = await getAuthUser(req)
      const check = await checkName(db, req.query.name, self?.userId ?? null)
      return check.ok ? { available: true } : { available: false, reason: check.reason }
    },
  )

  done()
}
