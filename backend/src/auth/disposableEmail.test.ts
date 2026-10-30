import { describe, it, expect } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { authOptions } from './options.js'

describe('sign-up with a disposable email', () => {
  const base = 'http://localhost:3000'
  // The hook answers before any query, so no database is needed
  const auth = betterAuth({
    ...authOptions({
      db: {} as Kysely<Database>,
      mail: { smtpUrl: null, from: null, verification: false },
      mailer: null,
      trustedOrigins: [base],
    }),
    baseURL: base,
    secret: 'test-secret-at-least-32-characters-long',
    rateLimit: { enabled: false },
  })
  const signUp = async (email: string) => {
    const res = await auth.handler(
      new Request(base + '/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ name: 'x', email, password: 'doubletop-16', acceptTerms: true }),
      }),
    )
    return { status: res.status, message: ((await res.json().catch(() => ({}))) as { message?: string }).message }
  }

  it('refuses a listed domain and a subdomain of one, with a readable message', async () => {
    for (const email of ['a@minafter.com', 'a@foo.minafter.com']) {
      expect(await signUp(email)).toEqual({ status: 400, message: 'Please use a permanent email address' })
    }
  })

  it('does not refuse a normal domain', async () => {
    expect((await signUp('a@gmail.com')).message).not.toBe('Please use a permanent email address')
  })
})
