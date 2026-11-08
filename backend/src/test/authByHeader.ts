// Import this first in an API test: the `x-user` header names the signed-in user, and a request
// without one is a 401. Registers the middleware mock itself, so the test needs no vi.mock.
import { vi } from 'vitest'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn(
    (
      req: { userId?: string; headers: Record<string, string | string[] | undefined> },
      reply: { code(n: number): { send(body: unknown): void } },
      done: () => void,
    ) => {
      const user = req.headers['x-user']
      if (typeof user !== 'string' || !user) {
        reply.code(401).send({ error: 'unauthorized' })
        return
      }
      req.userId = user
      done()
    },
  ),
}))
