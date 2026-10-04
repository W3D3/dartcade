import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getAuthUser } from '../auth/session.js'
import { searchUsers } from '../db/queries.js'
import { checkName } from '../users/account.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Other accounts, to add to a game as players. */
export function usersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'searchUsers'>>('/api/users', { preValidation: requireAuth, schema: fromSpec('searchUsers') }, async (req) => ({
    users: await searchUsers(db, req.query.q, req.userId),
  }))

  // Public: the sign-up page asks before an account exists. Signed in, your own name is free.
  app.get<Route<'checkNameAvailable'>>('/api/users/name-available', {
    schema: fromSpec('checkNameAvailable'),
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req) => {
    const self = await getAuthUser(req)
    const check = await checkName(db, req.query.name, self?.userId ?? null)
    return check.ok ? { available: true } : { available: false, reason: check.reason }
  })

  done()
}
