// Import this first in an API test: every request is then signed in as one user ('user-1',
// or whoever `signInAs` names). Registers the middleware mock itself, so the test needs no vi.mock.
import { vi } from 'vitest'
import { mockAuthAs, signedIn } from './auth.js'

vi.mock('../auth/middleware.js', () => mockAuthAs())

export const signInAs = (id: string) => {
  signedIn.id = id
}
