import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getAuthUser } from '../auth/session.js'
import { searchUsers } from '../db/queries.js'
import { getAvatarUpload } from '../db/users.js'
import { checkName } from '../users/account.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

const CACHE_FOR_GOOD = 'private, max-age=31536000, immutable'

/** Other accounts, to add to a game as players. */
export function usersApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'searchUsers'>>('/api/users', { preValidation: requireAuth, schema: fromSpec('searchUsers') }, async req => ({
    users: await searchUsers(db, req.query.q, req.userId),
  }))

  // A user's uploaded avatar photo; nothing to fetch for a none/preset avatar (the frontend renders those itself)
  app.get<Route<'getUserAvatar'>>(
    '/api/users/:id/avatar',
    { preValidation: requireAuth, schema: fromSpec('getUserAvatar') },
    async (req, reply) => {
      const avatar = await getAvatarUpload(db, req.params.id)
      if (!avatar) return reply.code(404).send({ error: 'no uploaded avatar' })
      reply.header('content-type', avatar.contentType)
      reply.header('cache-control', req.query.v === avatar.version ? CACHE_FOR_GOOD : 'no-store')
      return reply.send(avatar.image)
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
