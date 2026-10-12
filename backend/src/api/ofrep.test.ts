import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { ofrepApiPlugin } from './ofrep.js'
import { setupFlags } from '../flags/index.js'

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
  vi.mocked(getAuthUser).mockResolvedValue({ userId: role ? 'admin-1' : 'player-1' })
  vi.mocked(getRoleAndEmail).mockResolvedValue({ role, email: role ? 'boss@x' : 'p@x' })
}
const bulk = (headers: Record<string, string> = {}, payload: object = {}) =>
  app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags', headers, payload })
const minigolf = (body: string) => JSON.parse(body).flags.find((f: { key: string }) => f.key === 'gamemode.minigolf.enabled')

beforeAll(() => setupFlags(new Set()))
beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(null))

describe('OFREP', () => {
  it('answers a signed-out browser with every flag off, not 401', async () => {
    const res = await bulk()
    expect(res.statusCode).toBe(200)
    expect(minigolf(res.body)).toMatchObject({ value: false, variant: 'off' })
  })

  it("evaluates for the session's user and ignores the context the browser sends", async () => {
    signedIn('admin')
    expect(minigolf((await bulk()).body).value).toBe(true)
    signedIn(null)
    expect(minigolf((await bulk({}, { context: { admin: true, targetingKey: 'admin-1' } })).body).value).toBe(false)
  })

  it('evaluates one flag, and 404s an unknown one', async () => {
    signedIn('admin')
    const one = await app().inject({ method: 'POST', url: '/ofrep/v1/evaluate/flags/gamemode.minigolf.enabled', payload: {} })
    expect(JSON.parse(one.body)).toEqual({ key: 'gamemode.minigolf.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' })
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
    expect(minigolf(other.body).value).toBe(false)
  })
})
