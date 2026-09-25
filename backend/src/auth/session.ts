import type { FastifyRequest } from 'fastify'
import { auth } from './index.js'

export async function getAuthUser(
  req: FastifyRequest,
): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({
    headers: req.headers as unknown as Headers,
  })
  return session?.user ? { userId: session.user.id } : null
}
