import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { getAuthUser } from './session.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

// Callback style, as route options type their preValidation hook
export function requireAuth(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  getAuthUser(req)
    .then(user => {
      if (!user) {
        reply.code(401).send({ error: 'unauthorized' })
        return
      }
      req.userId = user.userId
      done()
    })
    // Also catches a throw from the success path above, so nothing is left unhandled
    .catch((err: unknown) => { done(err instanceof Error ? err : new Error(String(err))) })
}
