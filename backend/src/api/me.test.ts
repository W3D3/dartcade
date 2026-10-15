import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { meApiPlugin } from './me.js'
import { ApiError } from './errors.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'old'
    done()
  }),
}))
vi.mock('../db/users.js', () => ({ getAccount: vi.fn(), setInvisible: vi.fn(), getPreferences: vi.fn(), updatePreferences: vi.fn() }))
vi.mock('../users/account.js', () => ({ renameUser: vi.fn(), suggestName: vi.fn() }))

import { getAccount, getPreferences, setInvisible, updatePreferences } from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'

const app = () => {
  const a = createFastify()
  a.register(meApiPlugin, { db: {} as any })
  return a
}

beforeEach(() => {
  vi.mocked(getAccount).mockReset().mockResolvedValue({
    id: 'old',
    name: 'Phil Taylor',
    email: 'p@x',
    nameNeedsChange: true,
    invisible: false,
    role: null,
    createdAt: '2026-08-01T10:00:00.000Z',
  })
  vi.mocked(setInvisible).mockReset()
  vi.mocked(suggestName).mockReset().mockResolvedValue('Phil.Taylor')
  vi.mocked(renameUser).mockReset().mockResolvedValue('Phil_T')
})

describe('/api/me', () => {
  it('shows the account, with a suggestion while the name must change', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      id: 'old',
      name: 'Phil Taylor',
      email: 'p@x',
      nameNeedsChange: true,
      invisible: false,
      isAdmin: false,
      suggestedName: 'Phil.Taylor',
      createdAt: '2026-08-01T10:00:00.000Z',
    })
  })

  it('tells admins they are', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: 'a',
      name: 'Admin',
      email: 'a@x',
      nameNeedsChange: false,
      invisible: false,
      role: 'admin',
      createdAt: '2026-08-01T10:00:00.000Z',
    })
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(JSON.parse(res.body)).toMatchObject({ isAdmin: true })
    expect(JSON.parse(res.body)).not.toHaveProperty('role')
  })

  it('renames and answers with the account as it is now', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: 'old',
      name: 'Phil_T',
      email: 'p@x',
      nameNeedsChange: false,
      invisible: false,
      role: null,
      createdAt: '2026-08-01T10:00:00.000Z',
    })
    const res = await app().inject({ method: 'PATCH', url: '/api/me', payload: { name: 'Phil_T' } })
    expect(res.statusCode).toBe(200)
    expect(renameUser).toHaveBeenCalledWith({}, 'old', 'Phil_T')
    expect(JSON.parse(res.body)).toMatchObject({ name: 'Phil_T', nameNeedsChange: false, suggestedName: null })
  })

  it('passes a taken name on as 409', async () => {
    vi.mocked(renameUser).mockRejectedValue(new ApiError(409, { error: 'That name is taken' }))
    const res = await app().inject({ method: 'PATCH', url: '/api/me', payload: { name: 'luke' } })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'That name is taken' })
  })

  it('needs something to change', async () => {
    expect((await app().inject({ method: 'PATCH', url: '/api/me', payload: {} })).statusCode).toBe(400)
  })

  it('goes Invisible and tells friends', async () => {
    const onChanged = vi.fn()
    const a = createFastify()
    a.register(meApiPlugin, { db: {} as any, onChanged })
    vi.mocked(getAccount).mockResolvedValue({
      id: 'old',
      name: 'Phil_T',
      email: 'p@x',
      nameNeedsChange: false,
      invisible: true,
      role: null,
      createdAt: '2026-08-01T10:00:00.000Z',
    })
    const res = await a.inject({ method: 'PATCH', url: '/api/me', payload: { invisible: true } })
    expect(res.statusCode).toBe(200)
    expect(setInvisible).toHaveBeenCalledWith({}, 'old', true)
    expect(renameUser).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledWith('old')
    expect(JSON.parse(res.body).invisible).toBe(true)
  })
})

describe('/api/me/preferences', () => {
  beforeEach(() => {
    vi.mocked(getPreferences).mockReset().mockResolvedValue({ chalkboard: false })
    vi.mocked(updatePreferences)
      .mockReset()
      .mockImplementation((_db, _id, changes) => Promise.resolve({ chalkboard: false, ...changes }))
  })

  it('shows the preferences set so far', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/me/preferences' })
    expect(res.statusCode).toBe(200)
    expect(getPreferences).toHaveBeenCalledWith({}, 'old')
    expect(JSON.parse(res.body)).toEqual({ chalkboard: false })
  })

  it('stores known keys and drops unknown ones', async () => {
    const res = await app().inject({
      method: 'PUT',
      url: '/api/me/preferences',
      payload: { callerOn: true, x01StartScore: 301, callerVoice: null, volume: 0.2, evil: 'x'.repeat(1000) },
    })
    expect(res.statusCode).toBe(200)
    expect(updatePreferences).toHaveBeenCalledWith({}, 'old', { callerOn: true, x01StartScore: 301, callerVoice: null })
    expect(JSON.parse(res.body)).toEqual({ chalkboard: false, callerOn: true, x01StartScore: 301, callerVoice: null })
  })

  it.each([
    ['a value of the wrong type', { chalkboard: 'yes' }],
    ['a start score X01 does not offer', { x01StartScore: 401 }],
    ['an unknown check-out', { x01OutMode: 'triple' }],
    ['zero legs', { x01FirstTo: 0 }],
    ['an oversized voice id', { callerVoice: 'v'.repeat(201) }],
  ])('rejects %s', async (_what, payload) => {
    const res = await app().inject({ method: 'PUT', url: '/api/me/preferences', payload })
    expect(res.statusCode).toBe(400)
    expect(updatePreferences).not.toHaveBeenCalled()
  })
})
