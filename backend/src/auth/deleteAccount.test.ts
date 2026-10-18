import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertGameSession, finishGameSession } from '../db/queries.js'
import { authOptions } from './options.js'
import { setAccountCleanup } from './cleanup.js'
import type { Mail } from '../mail/transport.js'
import type { MailConfig } from '../mail/config.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('delete account', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const base = 'http://localhost:3000'
  const mailOff: MailConfig = { smtpUrl: null, from: null, verification: false }
  const mailOn: MailConfig = { smtpUrl: 'smtp://x', from: 'x@x', verification: false }

  const makeAuth = (mailer: { send: (m: Mail) => void } | null, mail: MailConfig = mailOff) =>
    betterAuth({
      ...authOptions({ db, mail, mailer, trustedOrigins: [base] }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  type Auth = ReturnType<typeof makeAuth>

  const post = (auth: Auth, path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(base + '/api/auth' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    )

  async function signUp(auth: Auth, name: string, email: string): Promise<{ id: string; cookie: string }> {
    const res = await post(auth, '/sign-up/email', { name, email, password: 'doubletop-16', acceptTerms: true })
    const body = (await res.json()) as { user: { id: string } }
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    return { id: body.user.id, cookie }
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('delete_account_test'))
  })
  afterAll(() => close())

  it('deletes the account at once without mail, keeping its name in shared history', async () => {
    const auth = makeAuth(null)
    const lena = await signUp(auth, 'Lena', 'lena@x.org')
    const max = await signUp(auth, 'Max', 'max@x.org')
    await insertGameSession(db, {
      id: 'g-1',
      owner_user_id: lena.id,
      board_db_id: null,
      game_id: 'x01',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [
        { name: 'Lena', user_id: lena.id, controller_user_id: lena.id, board_db_id: null, bot_level: null },
        { name: 'Max', user_id: max.id, controller_user_id: max.id, board_db_id: null, bot_level: null },
      ],
    })
    await finishGameSession(db, 'g-1', new Date(), [
      { placement: 1, stats: {}, throwPosition: 0, forfeited: false },
      { placement: 2, stats: {}, throwPosition: 1, forfeited: false },
    ])

    const cleaned: string[] = []
    setAccountCleanup(id => {
      cleaned.push(id)
      return Promise.resolve()
    })
    const res = await post(auth, '/delete-user', { password: 'doubletop-16' }, lena.cookie)
    expect(res.status).toBe(200)
    expect(cleaned).toEqual([lena.id])
    expect(await db.selectFrom('user').where('id', '=', lena.id).selectAll().executeTakeFirst()).toBeUndefined()
    const seat = await db
      .selectFrom('game_players')
      .selectAll()
      .where('session_id', '=', 'g-1')
      .where('seat', '=', 0)
      .executeTakeFirstOrThrow()
    expect(seat).toMatchObject({ name: 'Lena', user_id: null })
  })

  it('with mail on, mails a confirmation link and deletes only once it is opened', async () => {
    const sent: Mail[] = []
    const auth = makeAuth({ send: m => sent.push(m) }, mailOn)
    const nora = await signUp(auth, 'Nora', 'nora@x.org')
    const cleaned: string[] = []
    setAccountCleanup(id => {
      cleaned.push(id)
      return Promise.resolve()
    })

    const res = await post(auth, '/delete-user', { password: 'doubletop-16', callbackURL: '/#/login?deleted=1' }, nora.cookie)
    expect(res.status).toBe(200)
    expect(cleaned).toEqual([])
    expect(await db.selectFrom('user').where('id', '=', nora.id).selectAll().executeTakeFirst()).toBeDefined()

    const link = sent.at(-1)!.text.match(/https?:\S+/)![0]
    const confirmRes = await auth.handler(new Request(link, { headers: { origin: base, cookie: nora.cookie } }))
    expect([200, 302]).toContain(confirmRes.status)
    expect(cleaned).toEqual([nora.id])
    expect(await db.selectFrom('user').where('id', '=', nora.id).selectAll().executeTakeFirst()).toBeUndefined()
  })

  it('refuses a wrong password', async () => {
    const auth = makeAuth(null)
    const peter = await signUp(auth, 'Peter', 'peter@x.org')
    const res = await post(auth, '/delete-user', { password: 'wrong-password-99' }, peter.cookie)
    expect(res.status).toBe(400)
    expect(await db.selectFrom('user').where('id', '=', peter.id).selectAll().executeTakeFirst()).toBeDefined()
  })

  it('aborts the deletion when the cleanup throws, leaving the account intact', async () => {
    const auth = makeAuth(null)
    const otto = await signUp(auth, 'Otto', 'otto@x.org')
    setAccountCleanup(() => Promise.reject(new Error('cleanup boom')))
    const res = await post(auth, '/delete-user', { password: 'doubletop-16' }, otto.cookie)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await db.selectFrom('user').where('id', '=', otto.id).selectAll().executeTakeFirst()).toBeDefined()
  })
})
