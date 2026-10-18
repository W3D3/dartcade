import { describe, it, expect } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { authOptions } from './options.js'

const deps = () => ({
  db: {} as Kysely<Database>,
  mail: { smtpUrl: null, from: null, verification: false } as const,
  mailer: null,
  trustedOrigins: [],
})

describe('authOptions', () => {
  it('reads the client IP only from the header the /api/auth/* handler sets (never a client-sent one by default)', () => {
    expect(authOptions(deps()).advanced.ipAddress.ipAddressHeaders).toEqual(['x-dartcade-client-ip'])
  })

  it("doesn't override better-auth's own default for whether the rate limiter is on", () => {
    expect(authOptions(deps()).rateLimit).not.toHaveProperty('enabled')
  })
})
