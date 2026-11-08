import { vi } from 'vitest'

type Req = { userId?: string; headers: Record<string, string | string[] | undefined> }
type Reply = { code(n: number): { send(body: unknown): void } }

/** What `signedInAs` returns for requests without an `x-user` header (see `authAs.ts`). */
export const signedIn = { id: 'user-1' }

/** `../auth/middleware.js` where every request is the one user in `signedIn`. */
export const mockAuthAs = () => ({
  requireAuth: vi.fn((req: Req, _reply: Reply, done: () => void) => {
    req.userId = signedIn.id
    done()
  }),
})

/** `../auth/middleware.js` where the `x-user` header names the user, and no header means not signed in. */
export const mockAuthByHeader = () => ({
  requireAuth: vi.fn((req: Req, reply: Reply, done: () => void) => {
    if (!req.headers['x-user']) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    req.userId = req.headers['x-user'] as string
    done()
  }),
})
