import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import { base64 } from '@better-auth/utils/base64'
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { authOptions } from './options.js'
import { setAccountCleanup } from './cleanup.js'
import type { MailConfig } from '../mail/config.js'

const base = 'http://localhost:3000'
const b64u = (b: Buffer) => b.toString('base64url')

/** A software authenticator: an ES256 key and the assertions it signs, as a browser would send them. */
function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  // COSE_Key (EC2, ES256, P-256) as CBOR, the form the plugin stores
  const cose = Buffer.concat([
    Buffer.from('a5010203262001215820', 'hex'),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from('225820', 'hex'),
    Buffer.from(jwk.y!, 'base64url'),
  ])
  const credentialID = b64u(randomBytes(16))
  const assertion = (challenge: string, signer: KeyObject = privateKey, userVerified = true) => {
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: base }))
    const authenticatorData = Buffer.concat([
      createHash('sha256').update('localhost').digest(),
      Buffer.from([userVerified ? 0x05 : 0x01]),
      Buffer.alloc(4, 1),
    ])
    const signature = sign('sha256', Buffer.concat([authenticatorData, createHash('sha256').update(clientDataJSON).digest()]), signer)
    return {
      id: credentialID,
      rawId: credentialID,
      type: 'public-key',
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authenticatorData), signature: b64u(signature) },
    }
  }
  return { credentialID, publicKey: base64.encode(cose), assertion }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('passkeys', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const mailOff: MailConfig = { smtpUrl: null, from: null, verification: false }
  const mailOn: MailConfig = { smtpUrl: 'smtp://x', from: 'x@x', verification: true }
  let enabled = true

  const makeAuth = (mail: MailConfig = mailOff, mailer: { send: () => void } | null = null) =>
    betterAuth({
      ...authOptions({ db, mail, mailer, trustedOrigins: [], baseURL: base, passkeysEnabledFor: () => Promise.resolve(enabled) }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  type Auth = ReturnType<typeof makeAuth>

  const call = (auth: Auth, method: 'GET' | 'POST', path: string, opts: { body?: unknown; cookie?: string } = {}) =>
    auth.handler(
      new Request(base + '/api/auth' + path, {
        method,
        headers: { 'content-type': 'application/json', origin: base, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      }),
    )
  const cookiesOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .map(c => c.split(';')[0])
      .join('; ')

  async function signUp(auth: Auth, name: string, email: string) {
    const res = await call(auth, 'POST', '/sign-up/email', { body: { name, email, password: 'doubletop-16', acceptTerms: true } })
    const body = (await res.json()) as { user: { id: string } }
    return { id: body.user.id, cookie: cookiesOf(res) }
  }

  async function addPasskey(userId: string, a: ReturnType<typeof authenticator>) {
    await db
      .insertInto('passkey')
      .values({
        id: `pk-${a.credentialID}`,
        name: 'Test key',
        publicKey: a.publicKey,
        userId,
        credentialID: a.credentialID,
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      })
      .execute()
  }

  /** The WebAuthn ceremony as the browser runs it: options (and the challenge cookie), then the assertion. */
  async function assert(auth: Auth, a: ReturnType<typeof authenticator>, cookie?: string, signer?: KeyObject, userVerified?: boolean) {
    const opts = await call(auth, 'GET', '/passkey/generate-authenticate-options', { cookie })
    const { challenge } = (await opts.json()) as { challenge: string }
    const challengeCookie = cookiesOf(opts)
    return call(auth, 'POST', '/passkey/verify-authentication', {
      body: { response: a.assertion(challenge, signer, userVerified) },
      cookie: [cookie, challengeCookie].filter(Boolean).join('; '),
    })
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('passkeys_test'))
  })
  afterAll(() => close())

  it('signs in with a passkey: a session, last_login_at and the passkey last-used time', async () => {
    const auth = makeAuth()
    const lena = await signUp(auth, 'Lena', 'lena@x.org')
    const key = authenticator()
    await addPasskey(lena.id, key)
    await db.updateTable('user').set({ last_login_at: null }).execute()

    const res = await assert(auth, key)
    expect(res.status).toBe(200)
    const session = await call(auth, 'GET', '/get-session', { cookie: cookiesOf(res) })
    expect(((await session.json()) as { user: { id: string } }).user.id).toBe(lena.id)
    const user = await db.selectFrom('user').select('last_login_at').where('id', '=', lena.id).executeTakeFirstOrThrow()
    expect(user.last_login_at).toBeInstanceOf(Date)

    const list = await call(auth, 'GET', '/passkey/list-user-passkeys', { cookie: lena.cookie })
    const [row] = (await list.json()) as { name: string; lastUsedAt: string }[]
    expect(row.name).toBe('Test key')
    expect(new Date(row.lastUsedAt).getTime()).toBeGreaterThan(Date.now() - 60_000)
  })

  it('refuses a signature that is not the passkey’s', async () => {
    const auth = makeAuth()
    const user = await signUp(auth, 'Max', 'max@x.org')
    const key = authenticator()
    await addPasskey(user.id, key)
    const res = await assert(auth, key, undefined, generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(cookiesOf(res)).not.toContain('session_token')
    expect(await db.selectFrom('session').where('userId', '=', user.id).selectAll().execute()).toHaveLength(1) // sign-up's own
  })

  it('refuses a player the passkeys flag is off for', async () => {
    const auth = makeAuth()
    const user = await signUp(auth, 'Nora', 'nora@x.org')
    const key = authenticator()
    await addPasskey(user.id, key)
    enabled = false
    try {
      expect((await assert(auth, key)).status).toBe(403)
      const list = await call(auth, 'GET', '/passkey/list-user-passkeys', { cookie: user.cookie })
      expect(list.status).toBe(403)
    } finally {
      enabled = true
    }
  })

  it('holds a passkey sign-in to email verification like a password one', async () => {
    const auth = makeAuth(mailOn, { send: () => {} })
    await call(auth, 'POST', '/sign-up/email', {
      body: { name: 'Otto', email: 'otto@x.org', password: 'doubletop-16', acceptTerms: true },
    })
    const otto = await db.selectFrom('user').select('id').where('email', '=', 'otto@x.org').executeTakeFirstOrThrow()
    const key = authenticator()
    await addPasskey(otto.id, key)
    expect((await assert(auth, key)).status).toBe(403)
    await db
      .updateTable('user')
      .set({ emailVerified: true } as never)
      .where('id', '=', otto.id)
      .execute()
    expect((await assert(auth, key)).status).toBe(200)
  })

  it('refuses a banned player’s passkey sign-in', async () => {
    const auth = makeAuth()
    const user = await signUp(auth, 'Bea', 'bea@x.org')
    const key = authenticator()
    await addPasskey(user.id, key)
    await db.updateTable('user').set({ banned: true }).where('id', '=', user.id).execute()
    const res = await assert(auth, key)
    expect(((await res.json()) as { code: string }).code).toBe('BANNED_USER')
    expect(cookiesOf(res)).not.toContain('session_token')
  })

  describe('delete account with a passkey', () => {
    const exists = async (id: string) => (await db.selectFrom('user').where('id', '=', id).selectAll().executeTakeFirst()) !== undefined

    it('deletes after a fresh assertion by the signed-in player’s own passkey, even with mail on', async () => {
      const auth = makeAuth(mailOn, { send: () => {} })
      const user = await signUp(makeAuth(), 'Pia', 'pia@x.org')
      await db
        .updateTable('user')
        .set({ emailVerified: true } as never)
        .where('id', '=', user.id)
        .execute()
      const key = authenticator()
      await addPasskey(user.id, key)
      const cleaned: string[] = []
      setAccountCleanup(id => {
        cleaned.push(id)
        return Promise.resolve()
      })

      const asserted = await assert(auth, key, user.cookie)
      expect(asserted.status).toBe(200)
      const res = await call(auth, 'POST', '/delete-user/passkey', { cookie: cookiesOf(asserted) })
      expect(res.status).toBe(200)
      expect(cleaned).toEqual([user.id])
      expect(await exists(user.id)).toBe(false)
    })

    it('needs no password: a player who never had one can delete', async () => {
      const auth = makeAuth()
      const user = await signUp(auth, 'Quin', 'quin@x.org')
      await sql`DELETE FROM account WHERE "userId" = ${user.id}`.execute(db)
      const key = authenticator()
      await addPasskey(user.id, key)
      const asserted = await assert(auth, key, user.cookie)
      const res = await call(auth, 'POST', '/delete-user/passkey', { cookie: cookiesOf(asserted) })
      expect(res.status).toBe(200)
      expect(await exists(user.id)).toBe(false)
    })

    it('refuses an assertion that only proved presence, not the player (no PIN or biometric)', async () => {
      const auth = makeAuth()
      const user = await signUp(auth, 'Vic', 'vic@x.org')
      const key = authenticator()
      await addPasskey(user.id, key)
      const asserted = await assert(auth, key, user.cookie, undefined, false)
      expect(asserted.status).toBe(200)
      const res = await call(auth, 'POST', '/delete-user/passkey', { cookie: cookiesOf(asserted) })
      expect(res.status).toBe(401)
      expect(await exists(user.id)).toBe(true)
    })

    it('refuses without an assertion, however fresh the session', async () => {
      const auth = makeAuth()
      const user = await signUp(auth, 'Rey', 'rey@x.org')
      const res = await call(auth, 'POST', '/delete-user/passkey', { cookie: user.cookie })
      expect(res.status).toBe(401)
      expect(await exists(user.id)).toBe(true)
    })

    it('spends the proof once', async () => {
      const auth = makeAuth()
      const user = await signUp(auth, 'Sam', 'sam@x.org')
      const key = authenticator()
      await addPasskey(user.id, key)
      setAccountCleanup(() => Promise.reject(new Error('cleanup boom')))
      const asserted = await assert(auth, key, user.cookie)
      const cookie = cookiesOf(asserted)
      expect((await call(auth, 'POST', '/delete-user/passkey', { cookie })).status).toBeGreaterThanOrEqual(400)
      expect(await exists(user.id)).toBe(true)
      expect((await call(auth, 'POST', '/delete-user/passkey', { cookie })).status).toBe(401)
    })

    it('does not count another player’s passkey', async () => {
      const auth = makeAuth()
      const victim = await signUp(auth, 'Tia', 'tia@x.org')
      const other = await signUp(auth, 'Uma', 'uma@x.org')
      const key = authenticator()
      await addPasskey(other.id, key)
      const asserted = await assert(auth, key, victim.cookie)
      expect(asserted.status).toBe(200)
      // the assertion signed Uma in; Tia's own session never earned a proof
      const res = await call(auth, 'POST', '/delete-user/passkey', { cookie: victim.cookie })
      expect(res.status).toBe(401)
      expect(await exists(victim.id)).toBe(true)
    })
  })
})
