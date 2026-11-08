// Import this first in an API test: the `x-user` header names the signed-in user, and a request
// without one is a 401. Registers the middleware mock itself, so the test needs no vi.mock.
import { vi } from 'vitest'
import { mockAuthByHeader } from './auth.js'

vi.mock('../auth/middleware.js', () => mockAuthByHeader())
