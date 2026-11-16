import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
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
  const params = req.params
  const id = typeof params === 'object' && params !== null && 'id' in params ? params.id : undefined
  if (id !== undefined && id !== device.tournamentId) {
    req.deviceRefused = true
    void reply.code(404).send({ error: 'not found' })
    return false
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
