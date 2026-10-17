// Admins: better-auth's admin role (no list of emails: sign-up doesn't verify an address, so
// anyone could register a listed one). Admin pages and APIs check here.
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import { db } from '../db/index.js'
import { getRoleAndEmail } from '../db/users.js'

export function isAdmin(user: { role: string | null }): boolean {
  return user.role === 'admin'
}

/** After requireAuth: lets admins through, 403 for everyone else. */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  getRoleAndEmail(db, req.userId)
    .then(user => {
      if (!user || !isAdmin(user)) {
        reply.code(403).send({ error: 'forbidden' })
        return
      }
      done()
    })
    // Also catches a throw from the success path above, so nothing is left unhandled
    .catch((err: unknown) => {
      done(err instanceof Error ? err : new Error(String(err)))
    })
}
