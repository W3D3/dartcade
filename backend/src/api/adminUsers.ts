// Admin-only user management: list accounts, set their role, mark them verified, give them XP, ban them (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import {
  listUsers,
  getUser,
  getUserActivity,
  boardIdsByOwner,
  setRole,
  setVerified,
  listUserAudit,
  banUser,
  unbanUser,
  type AdminUserRow,
} from '../db/adminUsers.js'
import { bridgeConnections as liveBridges, type BridgeConnections } from '../bridge-gw/connections.js'
import { adjustRating } from '../db/ranked.js'
import { grantXp } from '../db/progression.js'
import { ApiError, notFound } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** After a ban is stored (sessions already gone): closes their sockets, lobby and games (auth/ban.ts) */
  onBanned?: (userId: string) => Promise<void>
  /** The live bridge connections (default: the app's) */
  bridges?: BridgeConnections
}

function serialize(row: AdminUserRow, bridges: { connected: number; total: number }) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    avatar: row.avatar,
    bridges,
    ban: row.ban && { category: row.ban.category, until: row.ban.until?.toISOString() ?? null, note: row.ban.note },
  }
}

/** Every route here is admin-only. */
export function adminUsersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]
  const live = opts.bridges ?? liveBridges

  /** The rows as the API shows them: with how many of the owner's bridges are connected right now */
  async function present(rows: AdminUserRow[]) {
    const boards = await boardIdsByOwner(
      db,
      rows.map(r => r.id),
    )
    return rows.map(r => {
      const ids = boards.get(r.id) ?? []
      return serialize(r, { connected: live.connectedFor(ids).length, total: ids.length })
    })
  }
  const presentOne = async (row: AdminUserRow) => (await present([row]))[0]

  app.get<Route<'listAdminUsers'>>('/api/admin/users', { preValidation: adminOnly, schema: fromSpec('listAdminUsers') }, async req => ({
    users: await present(await listUsers(db, req.query.q)),
  }))

  app.get<Route<'listUserAudit'>>(
    '/api/admin/users/:id/audit',
    { preValidation: adminOnly, schema: fromSpec('listUserAudit') },
    async req => ({
      entries: (await listUserAudit(db, req.params.id)).map(e => ({ ...e, createdAt: e.createdAt.toISOString() })),
    }),
  )

  app.get<Route<'getUserActivity'>>(
    '/api/admin/users/:id/activity',
    { preValidation: adminOnly, schema: fromSpec('getUserActivity') },
    async req => {
      const activity = await getUserActivity(db, req.params.id)
      if (!activity) throw notFound()
      const boardNames = new Map(activity.account.boards.map(b => [b.id, b.name]))
      return {
        bridges: live.connectedFor([...boardNames.keys()]).map(({ boardDbId, conn }) => ({
          boardId: boardDbId,
          boardName: boardNames.get(boardDbId) ?? '',
          version: conn.bridgeVersion ?? null,
          connectedAt: conn.connectedAt.toISOString(),
        })),
        account: activity.account,
        games: { ...activity.games, lastAt: activity.games.lastAt?.toISOString() ?? null },
        darts: activity.darts,
      }
    },
  )

  app.put<Route<'setUserRole'>>('/api/admin/users/:id/role', { preValidation: adminOnly, schema: fromSpec('setUserRole') }, async req => {
    const result = await setRole(db, req.params.id, req.body.role)
    if (result === 'not-found') throw notFound()
    if (result === 'last-admin') throw new ApiError(409, { error: 'There must be at least one admin' })
    const user = await getUser(db, req.params.id)
    if (!user) throw notFound()
    return presentOne(user)
  })

  app.put<Route<'setUserVerified'>>(
    '/api/admin/users/:id/verified',
    { preValidation: adminOnly, schema: fromSpec('setUserVerified') },
    async req => {
      const result = await setVerified(db, req.params.id, req.body.verified)
      if (result === 'not-found') throw notFound()
      const user = await getUser(db, req.params.id)
      if (!user) throw notFound()
      req.log.info({ targetId: req.params.id, verified: req.body.verified, adminId: req.userId }, 'admin set user verified')
      return presentOne(user)
    },
  )

  app.post<Route<'grantUserXp'>>('/api/admin/users/:id/xp', { preValidation: adminOnly, schema: fromSpec('grantUserXp') }, async req => {
    const result = await grantXp(db, req.userId, req.params.id, req.body.amount)
    if (result === 'not-found') throw notFound()
    req.log.info({ targetId: req.params.id, amount: req.body.amount, adminId: req.userId }, 'admin granted user xp')
    return result
  })

  app.post<Route<'adjustUserRating'>>(
    '/api/admin/users/:id/ranked/adjust',
    { preValidation: adminOnly, schema: fromSpec('adjustUserRating') },
    async req => {
      const { mode, rating, reason } = req.body
      const result = await adjustRating(db, req.userId, req.params.id, { kind: 'set', mode, rating, reason: reason.trim() })
      if (!result) throw notFound()
      req.log.info({ targetId: req.params.id, mode, rating, adminId: req.userId }, 'admin adjusted ranked rating')
      return result
    },
  )

  app.post<Route<'resetUserRating'>>(
    '/api/admin/users/:id/ranked/reset',
    { preValidation: adminOnly, schema: fromSpec('resetUserRating') },
    async req => {
      const { mode, reason } = req.body
      const result = await adjustRating(db, req.userId, req.params.id, { kind: 'reset', mode, reason: reason.trim() })
      if (!result) throw notFound()
      req.log.info({ targetId: req.params.id, mode, adminId: req.userId }, 'admin reset ranked rating')
      return result
    },
  )

  app.put<Route<'banUser'>>('/api/admin/users/:id/ban', { preValidation: adminOnly, schema: fromSpec('banUser') }, async req => {
    const until = req.body.until === null ? null : new Date(req.body.until)
    if (until && until.getTime() <= Date.now()) throw new ApiError(400, { error: 'A ban must end in the future' })
    const note = req.body.note?.trim() || null
    const result = await banUser(db, req.userId, req.params.id, { category: req.body.category, note, until })
    if (result === 'not-found') throw notFound()
    if (result === 'self') throw new ApiError(409, { error: "You can't ban yourself" })
    if (result === 'admin') throw new ApiError(409, { error: "Admins can't be banned" })
    req.log.info({ targetId: req.params.id, category: req.body.category, until, adminId: req.userId }, 'admin banned user')
    await opts.onBanned?.(req.params.id)
    const user = await getUser(db, req.params.id)
    if (!user) throw notFound()
    return presentOne(user)
  })

  app.delete<Route<'unbanUser'>>('/api/admin/users/:id/ban', { preValidation: adminOnly, schema: fromSpec('unbanUser') }, async req => {
    if ((await unbanUser(db, req.userId, req.params.id)) === 'not-found') throw notFound()
    req.log.info({ targetId: req.params.id, adminId: req.userId }, 'admin unbanned user')
    const user = await getUser(db, req.params.id)
    if (!user) throw notFound()
    return presentOne(user)
  })

  done()
}
