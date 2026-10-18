import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { authOptions } from './options.js'
import type { Mail } from '../mail/transport.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('email verification', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const sent: Mail[] = []
  const mail = { smtpUrl: 'smtp://x', from: 'x@x', verification: true } as const
  const base = 'http://localhost:3000'
  // betterAuth is generic over its options; a non-generic factory keeps the inferred Options
  // type the same between this declaration and the assignment below (ReturnType<typeof betterAuth>
  // alone widens to the generic's BetterAuthOptions constraint and stops typechecking)
  const makeAuth = () =>
    betterAuth({
      ...authOptions({ db, mail, mailer: { send: m => sent.push(m) }, trustedOrigins: [base] }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  let auth: ReturnType<typeof makeAuth>
  const post = (path: string, body: unknown) =>
    auth.handler(
      new Request(base + '/api/auth' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify(body),
      }),
    )

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('auth_verify_db_test'))
    auth = makeAuth()
  })
  afterAll(() => close())

  it('refuses sign-up without acceptTerms', async () => {
    const res = await post('/sign-up/email', { name: 'Nobody', email: 'n@x.org', password: 'doubletop-16' })
    expect(res.status).toBe(400)
  })

  it('sends a link, refuses sign-in until it is opened, then signs in', async () => {
    const res = await post('/sign-up/email', { name: 'Lena', email: 'lena@x.org', password: 'doubletop-16', acceptTerms: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie') ?? '').not.toContain('session_token')
    const link = sent.at(-1)!.text.match(/https?:\S+/)![0]
    expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'doubletop-16' })).status).toBe(403)
    const verified = await auth.handler(new Request(link, { headers: { origin: base } }))
    expect([200, 302]).toContain(verified.status)
    expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'doubletop-16' })).status).toBe(200)
    const row = await db
      .selectFrom('user')
      .select(['emailVerified', 'terms_accepted_at'])
      .where('email', '=', 'lena@x.org')
      .executeTakeFirstOrThrow()
    expect(row.emailVerified).toBe(true)
    expect(row.terms_accepted_at).toBeInstanceOf(Date)
  })

  // better-auth 1.7.6: requireEmailVerification makes a duplicate sign-up answer like a fresh one
  // (a synthetic 200), to avoid leaking which emails already have an account
  it('answers a second sign-up of a taken address like a new one (no 422, to not leak the address)', async () => {
    const res = await post('/sign-up/email', { name: 'Lena2', email: 'lena@x.org', password: 'doubletop-16', acceptTerms: true })
    expect(res.status).toBe(200)
  })

  it('resets a password through the mailed link and signs out other sessions', async () => {
    const res = await post('/request-password-reset', { email: 'lena@x.org', redirectTo: base + '/#/reset' })
    expect(res.status).toBe(200)
    const token = new URL(sent.at(-1)!.text.match(/https?:\S+/)![0]).pathname.split('/').at(-1)!
    expect((await post('/reset-password', { token, newPassword: 'bullseye-50!' })).status).toBe(200)
    expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'bullseye-50!' })).status).toBe(200)
  })

  it('answers a reset for an unknown address the same, sending nothing', async () => {
    const before = sent.length
    expect((await post('/request-password-reset', { email: 'nobody@x.org', redirectTo: base + '/#/reset' })).status).toBe(200)
    expect(sent.length).toBe(before)
  })
})
