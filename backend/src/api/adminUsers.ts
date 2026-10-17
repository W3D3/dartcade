// Admin-only user management: list accounts, promote or demote admins (schema/api-v1.yaml, tag admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { listUsers, getUser, setAdmin, type AdminUserRow } from '../db/adminUsers.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

function serialize(row: AdminUserRow) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.createdAt.toISOString() }
}

/** Every route here is admin-only. */
export function adminUsersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]

  app.get<Route<'listAdminUsers'>>('/api/admin/users', { preValidation: adminOnly, schema: fromSpec('listAdminUsers') }, async req => ({
    users: (await listUsers(db, req.query.q)).map(serialize),
  }))

  app.put<Route<'setUserRole'>>('/api/admin/users/:id/role', { preValidation: adminOnly, schema: fromSpec('setUserRole') }, async req => {
    const result = await setAdmin(db, req.params.id, req.body.admin)
    if (result === 'not-found') throw new ApiError(404, { error: 'not found' })
    if (result === 'last-admin') throw new ApiError(409, { error: 'There must be at least one admin' })
    const user = await getUser(db, req.params.id)
    if (!user) throw new ApiError(404, { error: 'not found' })
    return serialize(user)
  })

  done()
}
