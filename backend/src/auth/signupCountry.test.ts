import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { setCountry } from '../db/users.js'
import { authOptions } from './options.js'
import { createCountryResolver, geoConfig } from '../geo/country.js'
import { insertUsers } from '../test/fixtures.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('country at sign-up', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const base = 'http://localhost:3000'
  const auth = () =>
    betterAuth({
      ...authOptions({
        db,
        mail: { smtpUrl: null, from: null, verification: false },
        mailer: null,
        trustedOrigins: [base],
        countryOf: createCountryResolver(geoConfig({ GEO_TRUST_HEADER: '1' }), () => undefined),
      }),
      baseURL: base,
      secret: 'test-secret-at-least-32-characters-long',
      rateLimit: { enabled: false },
    })
  let a: ReturnType<typeof auth>

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    a.handler(
      new Request(`${base}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, ...headers },
        body: JSON.stringify(body),
      }),
    )
  const register = (name: string, headers: Record<string, string> = {}, extra: object = {}) =>
    post('/sign-up/email', { name, email: `${name}@example.org`, password: 'a-long-password-1', acceptTerms: true, ...extra }, headers)
  const countryOf = async (name: string) =>
    (await db.selectFrom('user').select('country').where('email', '=', `${name}@example.org`).executeTakeFirstOrThrow()).country

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('signup_country_test'))
    a = auth()
  })
  afterAll(() => close())

  it('fills the country from the trusted header on register', async () => {
    expect((await register('anna', { 'cf-ipcountry': 'AT' })).status).toBe(200)
    expect(await countryOf('anna')).toBe('AT')
  })

  it('leaves it empty without a usable header', async () => {
    await register('bert')
    await register('carl', { 'cf-ipcountry': 'XX' })
    expect(await countryOf('bert')).toBeNull()
    expect(await countryOf('carl')).toBeNull()
  })

  it('refuses a country in the request body: only the connection sets it', async () => {
    const res = await register('erik', {}, { country: 'FR' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' })
    expect(await db.selectFrom('user').select('id').where('email', '=', 'erik@example.org').execute()).toEqual([])
  })

  it('never sets it again: a cleared country stays cleared after the next sign-in', async () => {
    await register('dora', { 'cf-ipcountry': 'DE' })
    const id = (await db.selectFrom('user').select('id').where('email', '=', 'dora@example.org').executeTakeFirstOrThrow()).id
    await setCountry(db, id, null)
    const res = await post('/sign-in/email', { email: 'dora@example.org', password: 'a-long-password-1' }, { 'cf-ipcountry': 'DE' })
    expect(res.status).toBe(200)
    expect(await countryOf('dora')).toBeNull()
  })

  it('does not touch a user made another way (seed, bot)', async () => {
    await insertUsers(db, [{ id: 'seeded', name: 'Seeded' }])
    expect((await db.selectFrom('user').select('country').where('id', '=', 'seeded').executeTakeFirstOrThrow()).country).toBeNull()
  })
})
