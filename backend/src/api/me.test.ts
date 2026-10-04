import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { meApiPlugin } from './me.js'
import { ApiError } from './errors.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'old'; done() }),
}))
vi.mock('../db/users.js', () => ({ getAccount: vi.fn(), setInvisible: vi.fn() }))
vi.mock('../users/account.js', () => ({ renameUser: vi.fn(), suggestName: vi.fn() }))

import { getAccount, setInvisible } from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'

const app = () => { const a = createFastify(); a.register(meApiPlugin, { db: {} as any }); return a }

beforeEach(() => {
  vi.mocked(getAccount).mockReset().mockResolvedValue({ id: 'old', name: 'Phil Taylor', email: 'p@x', nameNeedsChange: true, invisible: false })
  vi.mocked(setInvisible).mockReset()
  vi.mocked(suggestName).mockReset().mockResolvedValue('Phil.Taylor')
  vi.mocked(renameUser).mockReset().mockResolvedValue('Phil_T')
})

describe('/api/me', () => {
  it('shows the account, with a suggestion while the name must change', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ id: 'old', name: 'Phil Taylor', email: 'p@x', nameNeedsChange: true, invisible: false, suggestedName: 'Phil.Taylor' })
  })

  it('renames and answers with the account as it is now', async () => {
    vi.mocked(getAccount).mockResolvedValue({ id: 'old', name: 'Phil_T', email: 'p@x', nameNeedsChange: false, invisible: false })
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
    vi.mocked(getAccount).mockResolvedValue({ id: 'old', name: 'Phil_T', email: 'p@x', nameNeedsChange: false, invisible: true })
    const res = await a.inject({ method: 'PATCH', url: '/api/me', payload: { invisible: true } })
    expect(res.statusCode).toBe(200)
    expect(setInvisible).toHaveBeenCalledWith({}, 'old', true)
    expect(renameUser).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledWith('old')
    expect(JSON.parse(res.body).invisible).toBe(true)
  })
})
