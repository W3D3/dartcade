import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { ofrepApiPlugin } from './ofrep.js'
import { setOverrides, setupFlags } from '../flags/index.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn() }))
vi.mock('../db/users.js', () => ({ getRoleAndEmail: vi.fn() }))

import { getAuthUser } from '../auth/session.js'
import { getRoleAndEmail } from '../db/users.js'

const app = () => {
  const a = createFastify()
  a.register(ofrepApiPlugin, { db: {} as any })
  return a
}
const signedIn = (role: string | null) => {
  vi.mocked(getAuthUser).mockResolvedValue({ userId: role ? 'admin-1' : 'player-1', impersonatedBy: null })
  vi.mocked(getRoleAndEmail).mockResolvedValue({ role, email: role ? 'boss@x' : 'p@x' })
}
const bulk = (headers: Record<string, string> = {}, payload: object = {}) =>
  app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers, payload })
const flagOf = (body: string, key: string) => JSON.parse(body).flags.find((f: { key: string }) => f.key === key)
const lights = (body: string) => flagOf(body, 'lights.enabled')

beforeAll(() => setupFlags(new Set()))
beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(null))

describe('OFREP', () => {
  it('answers a signed-out browser, not 401: admin flags off, flags on for everyone on', async () => {
    const res = await bulk()
    expect(res.statusCode).toBe(200)
    expect(lights(res.body)).toMatchObject({ value: false, variant: 'off' })
    expect(flagOf(res.body, 'auth.passkeys.enabled')).toMatchObject({ value: true, variant: 'on' })
  })

  it("shows a signed-out visitor the login page's passkey button only while the flag is on", async () => {
    await setOverrides(new Map([['auth.passkeys.enabled', { mode: 'off', userIds: [] }]]))
    try {
      expect(flagOf((await bulk()).body, 'auth.passkeys.enabled')).toMatchObject({ value: false })
    } finally {
      await setOverrides(new Map())
    }
    expect(flagOf((await bulk()).body, 'auth.passkeys.enabled')).toMatchObject({ value: true })
  })

  it("evaluates for the session's user and ignores the context the browser sends", async () => {
    signedIn('admin')
    expect(lights((await bulk()).body).value).toBe(true)
    signedIn(null)
    expect(lights((await bulk({}, { context: { admin: true, targetingKey: 'admin-1' } })).body).value).toBe(false)
  })

  it('sends number flags as numbers', async () => {
    const flags = JSON.parse((await bulk()).body).flags
    expect(flags.find((f: { key: string }) => f.key === 'matchmaking.visitSeconds')).toMatchObject({ value: 120 })
  })

  it('evaluates one flag, and 404s an unknown one', async () => {
    signedIn('admin')
    const one = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags/lights.enabled', payload: {} })
    expect(JSON.parse(one.body)).toEqual({ key: 'lights.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' })
    const none = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags/nope', payload: {} })
    expect(none.statusCode).toBe(404)
    expect(JSON.parse(none.body)).toEqual({ key: 'nope', errorCode: 'FLAG_NOT_FOUND' })
  })

  it('answers 304 for an unchanged result, never for another result', async () => {
    signedIn('admin')
    const first = await bulk()
    const etag = first.headers.etag as string
    expect(etag).toBeTruthy()
    expect((await bulk({ 'if-none-match': etag })).statusCode).toBe(304)
    // A non-admin sending the admin's ETag gets their own flags
    signedIn(null)
    const other = await bulk({ 'if-none-match': etag })
    expect(other.statusCode).toBe(200)
    expect(lights(other.body).value).toBe(false)
  })
})
