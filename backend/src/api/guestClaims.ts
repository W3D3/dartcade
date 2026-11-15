// Guest claims (schema/api-v1.yaml, tag games): the host of a finished game asks friends to take
// over its guest seats; a friend accepts or declines. The rules are in guestClaims/service.ts.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { ClaimError, type GuestClaimService } from '../guestClaims/service.js'
import { ApiError, notFound } from './errors.js'
import { requireFlag } from './flagGate.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database>; guestClaims: GuestClaimService }

/** The service's refusal as the API's 404, 403 or 409. */
async function answering<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!(err instanceof ClaimError)) throw err
    if (err.kind === 'not_found') throw notFound()
    if (err.kind === 'forbidden') throw new ApiError(403, { error: err.message })
    throw new ApiError(409, { error: err.message, code: err.kind })
  }
}

export function guestClaimsApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, guestClaims } = opts

  // Every route here: 404 while guest claims are off for the caller (after requireAuth, a preValidation)
  app.addHook('preHandler', async req => requireFlag(db, 'guestClaims.enabled', req.userId))

  app.get<Route<'getGuestClaims'>>('/api/games/:id/guest-claims', { preValidation: requireAuth, schema: fromSpec('getGuestClaims') }, req =>
    guestClaims.view(req.userId, req.params.id),
  )

  app.put<Route<'inviteGuestClaim'>>(
    '/api/games/:id/guest-claims/:seat',
    { preValidation: requireAuth, schema: fromSpec('inviteGuestClaim') },
    req => answering(() => guestClaims.invite(req.userId, req.params.id, req.params.seat, req.body.userId)),
  )

  app.delete<Route<'cancelGuestClaim'>>(
    '/api/games/:id/guest-claims/:seat',
    { preValidation: requireAuth, schema: fromSpec('cancelGuestClaim') },
    async (req, reply) => {
      await answering(() => guestClaims.cancel(req.userId, req.params.id, req.params.seat))
      return reply.code(204).send()
    },
  )

  app.post<Route<'acceptGuestClaim'>>(
    '/api/guest-claims/:claimId/accept',
    { preValidation: requireAuth, schema: fromSpec('acceptGuestClaim') },
    async (req, reply) => {
      await answering(() => guestClaims.accept(req.userId, req.params.claimId))
      return reply.code(204).send()
    },
  )

  app.post<Route<'declineGuestClaim'>>(
    '/api/guest-claims/:claimId/decline',
    { preValidation: requireAuth, schema: fromSpec('declineGuestClaim') },
    async (req, reply) => {
      await answering(() => guestClaims.decline(req.userId, req.params.claimId))
      return reply.code(204).send()
    },
  )

  done()
}
