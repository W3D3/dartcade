import type { FastifyRequest } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './index.js'

/** Who the request is signed in as. `impersonatedBy`: an admin's id when this is their impersonation session. */
export async function getAuthUser(req: FastifyRequest): Promise<{ userId: string; impersonatedBy: string | null } | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session?.user ? { userId: session.user.id, impersonatedBy: session.session.impersonatedBy ?? null } : null
}
