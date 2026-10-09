// Admins: better-auth's admin role, or an email in ADMIN_EMAILS (so a deployment can name its
// admins without touching the DB). Admin pages and APIs check here.
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import { db } from '../db/index.js'
import { getRoleAndEmail } from '../db/users.js'

const envAdmins = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

export function isAdmin(user: { role: string | null; email: string }, adminEmails: readonly string[] = envAdmins): boolean {
  return user.role === 'admin' || adminEmails.includes(user.email.toLowerCase())
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
