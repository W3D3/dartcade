import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { z } from 'zod'
import { getDeviceSession } from './deviceSession.js'
import { getAuthUser } from './session.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    /** An admin's id when the request is their impersonation session. */
    impersonatedBy?: string | null
  }
}

/**
 * Signs the request in: as a user, else as a venue device (tournament mode). A device is the
 * organizer who paired it, but is refused on every route that doesn't say `tournamentDevice: true`
 * (403) and on another tournament's `:id` (404), so what it may reach is an allow list.
 */
async function signIn(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = await getAuthUser(req)
  if (user) {
    req.userId = user.userId
    req.impersonatedBy = user.impersonatedBy
    return true
  }
  const device = await getDeviceSession(req)
  if (!device) {
    void reply.code(401).send({ error: 'unauthorized' })
    return false
  }
  if (!req.routeOptions.config.tournamentDevice) {
    req.deviceRefused = true
    void reply.code(403).send({ error: 'not available in tournament mode' })
    return false
  }
  const scope = req.routeOptions.config.tournamentDevice
  if (scope !== 'own') {
    // Fails closed: a route naming a param it does not have, or another tournament's id, is refused
    const params = z.record(z.string(), z.unknown()).safeParse(req.params)
    const id = params.success ? params.data[scope] : undefined
    if (id !== device.tournamentId) {
      req.deviceRefused = true
      void reply.code(id === undefined ? 403 : 404).send({ error: id === undefined ? 'not available in tournament mode' : 'not found' })
      return false
    }
  }
  req.userId = device.createdBy
  req.tournamentDevice = device
  return true
}

// Callback style, as route options type their preValidation hook
export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  signIn(req, reply)
    .then(ok => {
      if (ok) done()
    })
    // Also catches a throw from the success path above, so nothing is left unhandled
    .catch((err: unknown) => {
      done(err instanceof Error ? err : new Error(String(err)))
    })
}
