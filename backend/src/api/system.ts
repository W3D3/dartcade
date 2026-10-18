// The running version (public) and the admin System page's details (schema/api-v1.yaml, tags system and admin).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { buildInfo, configInfo, databaseInfo, runtimeInfo, type AdminSystem } from '../system/info.js'
import { parsePreview } from './preview.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Open sockets, running games and open lobbies, right now. */
  live: () => Promise<AdminSystem['live']>
  env?: Record<string, string | undefined>
}

export function systemApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, live, env = process.env } = opts

  app.get<Route<'getVersion'>>('/api/version', { schema: fromSpec('getVersion') }, () => buildInfo(env))

  app.get<Route<'getAdminSystem'>>(
    '/api/admin/system',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('getAdminSystem') },
    async () => ({
      build: { ...buildInfo(env), preview: parsePreview(env) },
      runtime: runtimeInfo(),
      database: await databaseInfo(db),
      live: await live(),
      config: configInfo(env),
    }),
  )

  done()
}
