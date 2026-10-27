import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { authOptions } from './options.js'
import { setAccountCleanup } from './cleanup.js'
import { createMailer } from '../mail/transport.js'
import type { MailConfig } from '../mail/config.js'
import { signInMethods } from '../db/users.js'

// The real mailer, over a fake SMTP transport: what reaches sendMail is what would be sent
const sendMail = vi.fn((_mail: { to: string; subject: string; text: string }) => Promise.resolve())
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }))

/** What Discord's /users/@me answers (the parts better-auth reads). */
type Profile = { id: string; username: string; global_name: string | null; email: string | null; verified: boolean }

describe.skipIf(!process.env.TEST_DATABASE_URL)('Sign in with Discord', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const base = 'http://localhost:3000'
  const mailOn: MailConfig = { smtpUrl: 'smtp://x', from: 'x@x', verification: true }
  const mailOff: MailConfig = { smtpUrl: null, from: null, verification: false }

  const makeAuth = (mail: MailConfig = mailOff) =>
    betterAuth({
      ...authOptions({
        db,
        mail,
        mailer: createMailer(mail, () => undefined),
        trustedOrigins: [base],
        discord: { clientId: 'client-id', clientSecret: 'client-secret' },
      }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  type Auth = ReturnType<typeof makeAuth>

  /** A fake Discord: its token endpoint takes any code, its /users/@me answers `profile`. */
  function fakeDiscord(profile: Profile) {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith('https://discord.com/api/oauth2/token'))
        return Promise.resolve(Response.json({ access_token: 'at', token_type: 'Bearer', expires_in: 3600, scope: 'identify email' }))
      if (decodeURIComponent(url).startsWith('https://discord.com/api/users/@me'))
        return Promise.resolve(Response.json({ avatar: null, discriminator: '0', ...profile }))
      return Promise.reject(new Error(`unexpected fetch ${url}`))
    })
  }

  const cookiesOf = (res: Response) => res.headers.getSetCookie().map(c => c.split(';')[0])

  /** The whole round trip: start the sign-in, let Discord send the browser back with a code. */
  async function discordSignIn(auth: Auth, profile: Profile): Promise<{ location: string; cookie: string }> {
    fakeDiscord(profile)
    const start = await auth.handler(
      new Request(`${base}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ provider: 'discord', callbackURL: `${base}/#/`, errorCallbackURL: `${base}/#/login` }),
      }),
    )
    const { url } = (await start.json()) as { url: string }
    expect(new URL(url).origin).toBe('https://discord.com')
    expect(new URL(url).searchParams.get('redirect_uri')).toBe(`${base}/api/auth/callback/discord`)
    const state = new URL(url).searchParams.get('state')!
    const back = await auth.handler(
      new Request(`${base}/api/auth/callback/discord?code=the-code&state=${state}`, {
        headers: { cookie: cookiesOf(start).join('; ') },
      }),
    )
    expect(back.status).toBe(302)
    return { location: back.headers.get('location')!, cookie: cookiesOf(back).join('; ') }
  }

  const userByEmail = (email: string) => db.selectFrom('user').selectAll().where('email', '=', email).executeTakeFirst()
  const providersOf = async (userId: string) =>
    (await db.selectFrom('account').select('providerId').where('userId', '=', userId).execute()).map(a => a.providerId).sort()

  const post = (auth: Auth, path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(base + '/api/auth' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    )

  const profile = (id: string, over: Partial<Profile> = {}): Profile => ({
    id,
    username: `user${id}`,
    global_name: null,
    email: `${id}@example.org`,
    verified: true,
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('discord_sign_in_test'))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sendMail.mockClear()
  })
  afterAll(() => close())

  it('creates an account named after the Discord display name, with the terms accepted, and signs it in', async () => {
    const auth = makeAuth()
    const { location, cookie } = await discordSignIn(auth, profile('1001', { global_name: 'Annie Darts' }))
    expect(location).toBe(`${base}/#/`)
    const user = await userByEmail('1001@example.org')
    expect(user).toMatchObject({ name: 'Annie.Darts', emailVerified: true })
    expect(user!.terms_accepted_at).toBeInstanceOf(Date)
    expect(await providersOf(user!.id)).toEqual(['discord'])
    expect(await signInMethods(db, user!.id)).toEqual(['discord'])
    const session = await auth.handler(new Request(`${base}/api/auth/get-session`, { headers: { cookie } }))
    expect(((await session.json()) as { user: { id: string } }).user.id).toBe(user!.id)
  })

  it('numbers a name that is taken instead of refusing the sign-in', async () => {
    const auth = makeAuth()
    await discordSignIn(auth, profile('1002', { global_name: 'Bully' }))
    await discordSignIn(auth, profile('1003', { global_name: 'bully' }))
    expect((await userByEmail('1003@example.org'))?.name).toBe('bully2')
  })

  it('gives an account without an email a .invalid stand-in, and never mails it', async () => {
    const auth = makeAuth(mailOn)
    const { location } = await discordSignIn(auth, profile('1004', { email: null, verified: false }))
    expect(location).toBe(`${base}/#/`)
    const user = await userByEmail('1004@discord.invalid')
    expect(user).toMatchObject({ name: 'user1004', emailVerified: false })
    // Forgot password for it answers like for any address, and sends nothing
    expect((await post(auth, '/request-password-reset', { email: '1004@discord.invalid', redirectTo: '/#/reset' })).status).toBe(200)
    expect(sendMail.mock.calls.filter(([m]) => m.to.endsWith('.invalid'))).toEqual([])
  })

  describe('an existing email account with the same email', () => {
    async function passwordAccount(auth: Auth, name: string, email: string, verified: boolean) {
      await post(auth, '/sign-up/email', { name, email, password: 'doubletop-16', acceptTerms: true })
      await db.updateTable('user').set({ emailVerified: verified }).where('email', '=', email).execute()
      return (await userByEmail(email))!
    }

    it('is linked when Discord says the email is verified', async () => {
      const auth = makeAuth()
      const lena = await passwordAccount(auth, 'Lena', 'lena@example.org', true)
      const { location } = await discordSignIn(auth, profile('2001', { email: 'lena@example.org', verified: true }))
      expect(location).toBe(`${base}/#/`)
      expect(await providersOf(lena.id)).toEqual(['credential', 'discord'])
      expect(await signInMethods(db, lena.id)).toEqual(['password', 'discord'])
      expect((await userByEmail('lena@example.org'))?.name).toBe('Lena')
    })

    it('is not taken over by a Discord account whose email is unverified', async () => {
      const auth = makeAuth()
      const max = await passwordAccount(auth, 'Max', 'max@example.org', true)
      const { location, cookie } = await discordSignIn(auth, profile('2002', { email: 'max@example.org', verified: false }))
      expect(location).toBe('http://localhost:3000/?error=account_not_linked#/login')
      expect(cookie).not.toContain('session_token')
      expect(await providersOf(max.id)).toEqual(['credential'])
    })

    it('is not linked while its own email is unverified (someone may have signed up with an address that is not theirs)', async () => {
      const auth = makeAuth()
      const nora = await passwordAccount(auth, 'Nora', 'nora@example.org', false)
      const { location } = await discordSignIn(auth, profile('2003', { email: 'nora@example.org', verified: true }))
      expect(location).toContain('error=account_not_linked')
      expect(await providersOf(nora.id)).toEqual(['credential'])
    })
  })

  describe('deleting an account without a password', () => {
    it('deletes it at once after a fresh Discord sign-in, running the cleanup and mailing nothing', async () => {
      const auth = makeAuth(mailOn)
      const { cookie } = await discordSignIn(auth, profile('3001'))
      const user = (await userByEmail('3001@example.org'))!
      const cleaned: string[] = []
      setAccountCleanup(id => {
        cleaned.push(id)
        return Promise.resolve()
      })
      sendMail.mockClear()
      const res = await post(auth, '/delete-user', { callbackURL: '/#/login?deleted=1' }, cookie)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ message: 'User deleted' })
      expect(cleaned).toEqual([user.id])
      expect(await userByEmail('3001@example.org')).toBeUndefined()
      expect(sendMail).not.toHaveBeenCalled()
    })

    it('asks for a fresh Discord sign-in when the session is older than a few minutes', async () => {
      const auth = makeAuth()
      const { cookie } = await discordSignIn(auth, profile('3002'))
      const user = (await userByEmail('3002@example.org'))!
      await db
        .updateTable('session')
        .set({ createdAt: new Date(Date.now() - 10 * 60_000) })
        .where('userId', '=', user.id)
        .execute()
      const res = await post(auth, '/delete-user', {}, cookie)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 'FRESH_SIGN_IN_REQUIRED' })
      expect(await userByEmail('3002@example.org')).toBeDefined()
    })
  })
})
