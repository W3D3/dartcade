import type { FastifyRequest } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from './index.js'

export async function getAuthUser(
  req: FastifyRequest,
): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session?.user ? { userId: session.user.id } : null
}
