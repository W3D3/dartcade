// Admin-only user management: list accounts, set their role, mark them verified, give them XP, ban them (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { listUsers, getUser, setRole, setVerified, banUser, unbanUser, type AdminUserRow } from '../db/adminUsers.js'
import { grantXp } from '../db/progression.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** After a ban is stored (sessions already gone): closes their sockets, lobby and games (auth/ban.ts) */
  onBanned?: (userId: string) => Promise<void>
}

function serialize(row: AdminUserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    avatar: row.avatar,
    ban: row.ban && { category: row.ban.category, until: row.ban.until?.toISOString() ?? null, note: row.ban.note },
  }
}

/** Every route here is admin-only. */
export function adminUsersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]

  app.get<Route<'listAdminUsers'>>('/api/admin/users', { preValidation: adminOnly, schema: fromSpec('listAdminUsers') }, async req => ({
    users: (await listUsers(db, req.query.q)).map(serialize),
  }))

  app.put<Route<'setUserRole'>>('/api/admin/users/:id/role', { preValidation: adminOnly, schema: fromSpec('setUserRole') }, async req => {
    const result = await setRole(db, req.params.id, req.body.role)
    if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
    if (result === 'last-admin') throw new ApiError(409, { error: 'There must be at least one admin' })
    const user = await getUser(db, req.params.id)
    if (!user) throw new ApiError(404, { error: 'not found' })
    return serialize(user)
  })

  app.put<Route<'setUserVerified'>>(
    '/api/admin/users/:id/verified',
    { preValidation: adminOnly, schema: fromSpec('setUserVerified') },
    async req => {
      const result = await setVerified(db, req.params.id, req.body.verified)
      if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
      const user = await getUser(db, req.params.id)
      if (!user) throw new ApiError(404, { error: 'not found' })
      req.log.info({ targetId: req.params.id, verified: req.body.verified, adminId: req.userId }, 'admin set user verified')
      return serialize(user)
    },
  )

  app.post<Route<'grantUserXp'>>('/api/admin/users/:id/xp', { preValidation: adminOnly, schema: fromSpec('grantUserXp') }, async req => {
    const result = await grantXp(db, req.userId, req.params.id, req.body.amount)
    if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
    req.log.info({ targetId: req.params.id, amount: req.body.amount, adminId: req.userId }, 'admin granted user xp')
    return result
  })

  app.put<Route<'banUser'>>('/api/admin/users/:id/ban', { preValidation: adminOnly, schema: fromSpec('banUser') }, async req => {
    const until = req.body.until === null ? null : new Date(req.body.until)
    if (until && until.getTime() <= Date.now()) throw new ApiError(400, { error: 'A ban must end in the future' })
    const note = req.body.note?.trim() || null
    const result = await banUser(db, req.userId, req.params.id, { category: req.body.category, note, until })
    if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
    if (result === 'self') throw new ApiError(409, { error: "You can't ban yourself" })
    if (result === 'admin') throw new ApiError(409, { error: "Admins can't be banned" })
    req.log.info({ targetId: req.params.id, category: req.body.category, until, adminId: req.userId }, 'admin banned user')
    await opts.onBanned?.(req.params.id)
    const user = await getUser(db, req.params.id)
    if (!user) throw new ApiError(404, { error: 'not found' })
    return serialize(user)
  })

  app.delete<Route<'unbanUser'>>('/api/admin/users/:id/ban', { preValidation: adminOnly, schema: fromSpec('unbanUser') }, async req => {
    if ((await unbanUser(db, req.userId, req.params.id)) === 'not-found') throw new ApiError(404, { error: 'not found' })
    req.log.info({ targetId: req.params.id, adminId: req.userId }, 'admin unbanned user')
    const user = await getUser(db, req.params.id)
    if (!user) throw new ApiError(404, { error: 'not found' })
    return serialize(user)
  })

  done()
}
