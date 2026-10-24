import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { banUser } from '../db/adminUsers.js'
import { authOptions } from './options.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('signing in while banned', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const base = 'http://localhost:3000'
  const makeAuth = () =>
    betterAuth({
      ...authOptions({ db, mail: { smtpUrl: null, from: null, verification: false }, mailer: null, trustedOrigins: [base] }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  let auth: ReturnType<typeof makeAuth>
  const post = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(base + '/api/auth' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    )
  const signIn = (email: string, password = 'doubletop-16') => post('/sign-in/email', { email, password })
  const sessionOf = async (cookie: string) =>
    (await auth.handler(new Request(base + '/api/auth/get-session', { headers: { cookie, origin: base } }))).json()

  async function signUp(name: string): Promise<{ id: string; cookie: string }> {
    const res = await post('/sign-up/email', { name, email: `${name}@x.org`, password: 'doubletop-16', acceptTerms: true })
    expect(res.status).toBe(200)
    const { user } = (await res.json()) as { user: { id: string } }
    return { id: user.id, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] }
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('auth_ban_test'))
    auth = makeAuth()
    await db
      .insertInto('user')
      .values({ id: 'admin', name: 'Admin', email: 'admin@x.org', emailVerified: true, image: null, role: 'admin' })
      .execute()
  })
  afterAll(() => close())

  it('ends their sessions, then refuses sign-in with the public line and the end, never the note', async () => {
    const lena = await signUp('lena')
    expect(await sessionOf(lena.cookie)).not.toBeNull()
    const until = new Date(Date.now() + 7 * 86_400_000)
    expect(await banUser(db, 'admin', lena.id, { category: 'cheating', note: 'typed in 180s all night', until })).toBe('ok')
    expect(await sessionOf(lena.cookie)).toBeNull()

    const res = await signIn('lena@x.org')
    expect(res.status).toBe(403)
    const body = await res.text()
    expect(JSON.parse(body)).toEqual({
      code: 'BANNED_USER',
      message: 'Closed for cheating',
      category: 'cheating',
      until: until.toISOString(),
    })
    expect(body).not.toContain('180s')
  })

  it("tells nobody about a ban without the account's password", async () => {
    const res = await signIn('lena@x.org', 'wrong-password-1')
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('cheating')
  })

  it('says a permanent ban has no end', async () => {
    const max = await signUp('max')
    await banUser(db, 'admin', max.id, { category: 'harassment', note: null, until: null })
    const res = await signIn('max@x.org')
    expect(await res.json()).toMatchObject({ code: 'BANNED_USER', category: 'harassment', until: null })
  })

  it('lets them back in once a timed ban has ended', async () => {
    const anna = await signUp('anna')
    await banUser(db, 'admin', anna.id, { category: 'spamming', note: null, until: new Date(Date.now() + 60_000) })
    expect((await signIn('anna@x.org')).status).toBe(403)
    await db
      .updateTable('user')
      .set({ banExpires: new Date(Date.now() - 1000) })
      .where('id', '=', anna.id)
      .execute()
    expect((await signIn('anna@x.org')).status).toBe(200)
  })

  it("refuses better-auth's own ban and unban routes, leaving the account as it was", async () => {
    const boss = await signUp('boss')
    await db.updateTable('user').set({ role: 'admin' }).where('id', '=', boss.id).execute()
    const { id: benId } = await signUp('ben')
    expect((await post('/admin/ban-user', { userId: benId }, boss.cookie)).status).toBe(404)
    expect((await signIn('ben@x.org')).status).toBe(200)

    await banUser(db, 'admin', benId, { category: 'cheating', note: null, until: null })
    expect((await post('/admin/unban-user', { userId: benId }, boss.cookie)).status).toBe(404)
    expect((await signIn('ben@x.org')).status).toBe(403)
    const row = await db.selectFrom('user').select(['banned']).where('id', '=', benId).executeTakeFirstOrThrow()
    expect(row.banned).toBe(true)
  })
})
