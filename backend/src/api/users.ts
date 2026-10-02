import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { searchUsers } from '../db/queries.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** Other accounts, to add to a game as players. */
export function usersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'searchUsers'>>('/api/users', { preValidation: requireAuth, schema: fromSpec('searchUsers') }, async (req) => ({
    users: await searchUsers(db, req.query.q, req.userId),
  }))

  done()
}
