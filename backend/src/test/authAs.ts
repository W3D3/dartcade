// Import this first in an API test: every request is then signed in as one user ('user-1',
// or whoever `signInAs` names). Registers the middleware mock itself, so the test needs no vi.mock.
import { vi } from 'vitest'

const signedIn = vi.hoisted(() => ({ id: 'user-1' }))

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: { userId?: string }, _reply: unknown, done: () => void) => {
    req.userId = signedIn.id
    done()
  }),
}))

export const signInAs = (id: string) => {
  signedIn.id = id
}
