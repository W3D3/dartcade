import type { FastifyRequest, FastifyReply } from 'fastify'
import { getAuthUser } from './session.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await getAuthUser(req)
  if (!user) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }
  req.userId = user.userId
}
