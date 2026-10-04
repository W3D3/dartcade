import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getAccount, setInvisible } from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Name or Invisible changed: friends see it. */
  onChanged?: (userId: string) => void
}

/** The signed-in account: GET shows it, PATCH changes the name or Invisible. */
export function meApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  async function me(userId: string) {
    const account = await getAccount(db, userId)
    if (!account) throw new ApiError(404, { error: 'account not found' })
    return { ...account, suggestedName: account.nameNeedsChange ? await suggestName(db, account.name, account.id) : null }
  }

  app.get<Route<'getMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('getMe') }, async (req) => me(req.userId))

  app.patch<Route<'updateMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('updateMe') }, async (req) => {
    if (req.body.name !== undefined) await renameUser(db, req.userId, req.body.name)
    if (req.body.invisible !== undefined) await setInvisible(db, req.userId, req.body.invisible)
    opts.onChanged?.(req.userId)
    return me(req.userId)
  })

  done()
}
