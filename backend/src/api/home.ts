import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { listFriendActivity } from '../db/activity.js'
import { homeLobbies } from '../db/homeLobbies.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** What the Home page shows about friends: their lobbies and what they did lately. */
export function homeApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const auth = { preValidation: requireAuth }

  app.get<Route<'getHomeLobbies'>>('/api/home/lobbies', { ...auth, schema: fromSpec('getHomeLobbies') }, async req => ({
    lobbies: await homeLobbies(db, req.userId),
  }))

  app.get<Route<'getHomeActivity'>>('/api/home/activity', { ...auth, schema: fromSpec('getHomeActivity') }, async req => ({
    events: (await listFriendActivity(db, req.userId)).map(({ createdAt, ...e }) => ({ ...e, at: createdAt.toISOString() })),
  }))

  done()
}
