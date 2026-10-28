import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFastify } from './fastify.js'
import { meApiPlugin } from './me.js'
import { ApiError } from './errors.js'
import { setupFlags } from '../flags/index.js'
import { AVATAR_FINISHES } from '../shared/avatarFinishes.js'
import * as middleware from '../auth/middleware.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => {
    req.userId = 'old'
    done()
  }),
}))
vi.mock('../db/users.js', () => ({
  getAccount: vi.fn(),
  getRoleAndEmail: vi.fn().mockResolvedValue({ role: null, email: 'p@x' }),
  setInvisible: vi.fn(),
  signInMethods: vi.fn().mockResolvedValue(['password']),
  setAvatar: vi.fn(),
  setAvatarUpload: vi.fn(),
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
  UnknownAvatarFinishError: class UnknownAvatarFinishError extends Error {},
}))
vi.mock('../users/account.js', () => ({ renameUser: vi.fn(), suggestName: vi.fn() }))
vi.mock('../db/progression.js', () => ({ hasPerk: vi.fn(), unlockedPictures: vi.fn() }))

import {
  getAccount,
  getPreferences,
  setAvatar,
  setAvatarUpload,
  setInvisible,
  updatePreferences,
  UnknownAvatarFinishError,
} from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'
import { hasPerk, unlockedPictures } from '../db/progression.js'

const deleteAccount = vi.fn()

const app = () => {
  const a = createFastify()
  a.register(meApiPlugin, { db: {} as any, deleteAccount })
  return a
}

beforeEach(() => {
  vi.mocked(getAccount)
    .mockReset()
    .mockResolvedValue({
      id: 'old',
      name: 'Phil Taylor',
      email: 'p@x',
      nameNeedsChange: true,
      invisible: false,
      role: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      avatar: { kind: 'none' },
    })
  vi.mocked(setInvisible).mockReset()
  vi.mocked(suggestName).mockReset().mockResolvedValue('Phil.Taylor')
  vi.mocked(renameUser).mockReset().mockResolvedValue('Phil_T')
  vi.mocked(hasPerk).mockReset().mockResolvedValue(true)
  vi.mocked(unlockedPictures).mockReset().mockResolvedValue(['classic', 'chalk'])
})

describe('/api/me', () => {
  beforeEach(async () => {
    await setupFlags(new Set(['progression.enabled']))
  })
  afterEach(async () => {
    await setupFlags(new Set())
  })

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
      isModerator: false,
      impersonating: false,
      signInMethods: ['password'],
      suggestedName: 'Phil.Taylor',
      createdAt: '2026-08-01T10:00:00.000Z',
      avatar: { kind: 'none' },
      pictures: ['classic', 'chalk'],
    })
  })

  it('says when an admin is viewing the app as this account', async () => {
    vi.mocked(middleware.requireAuth).mockImplementationOnce((req, _reply, done) => {
      req.userId = 'old'
      req.impersonatedBy = 'boss'
      done()
    })
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(JSON.parse(res.body)).toMatchObject({ impersonating: true, isAdmin: false })
  })

  describe('DELETE', () => {
    it('deletes and passes on the cookie-clearing headers', async () => {
      const headers = new Headers()
      headers.append('set-cookie', 'better-auth.session_token=; Max-Age=0')
      deleteAccount.mockResolvedValueOnce({ deleted: true, headers })
      const res = await app().inject({ method: 'DELETE', url: '/api/me', headers: { cookie: 'c=1' } })
      expect(res.statusCode).toBe(204)
      expect(res.headers['set-cookie']).toEqual(['better-auth.session_token=; Max-Age=0'])
      expect((deleteAccount.mock.calls[0][0] as Headers).get('cookie')).toBe('c=1')
    })

    it.each([
      ['stale', 400],
      ['has-password', 409],
      ['signed-out', 401],
    ])('answers %s with %i', async (reason, status) => {
      deleteAccount.mockResolvedValueOnce({ deleted: false, reason })
      expect((await app().inject({ method: 'DELETE', url: '/api/me' })).statusCode).toBe(status)
    })

    it('refuses an admin viewing as the account', async () => {
      deleteAccount.mockReset()
      vi.mocked(middleware.requireAuth).mockImplementationOnce((req, _reply, done) => {
        req.userId = 'old'
        req.impersonatedBy = 'boss'
        done()
      })
      expect((await app().inject({ method: 'DELETE', url: '/api/me' })).statusCode).toBe(403)
      expect(deleteAccount).not.toHaveBeenCalled()
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
      avatar: { kind: 'none' },
    })
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(JSON.parse(res.body)).toMatchObject({ isAdmin: true, isModerator: true })
    expect(JSON.parse(res.body)).not.toHaveProperty('role')
  })

  it('tells moderators they moderate, but are no admin', async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: 'm',
      name: 'Mod',
      email: 'm@x',
      nameNeedsChange: false,
      invisible: false,
      role: 'moderator',
      createdAt: '2026-08-01T10:00:00.000Z',
      avatar: { kind: 'none' },
    })
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(JSON.parse(res.body)).toMatchObject({ isAdmin: false, isModerator: true })
  })

  it('renames, tells the lobby, and answers with the account as it is now', async () => {
    const onRenamed = vi.fn().mockResolvedValue(undefined)
    const a = createFastify()
    a.register(meApiPlugin, { db: {} as any, deleteAccount, onRenamed })
    vi.mocked(getAccount).mockResolvedValue({
      id: 'old',
      name: 'Phil_T',
      email: 'p@x',
      nameNeedsChange: false,
      invisible: false,
      role: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      avatar: { kind: 'none' },
    })
    const res = await a.inject({ method: 'PATCH', url: '/api/me', payload: { name: 'Phil_T' } })
    expect(res.statusCode).toBe(200)
    expect(renameUser).toHaveBeenCalledWith({}, 'old', 'Phil_T')
    expect(onRenamed).toHaveBeenCalledWith('old', 'Phil_T')
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
    a.register(meApiPlugin, { db: {} as any, deleteAccount, onChanged })
    vi.mocked(getAccount).mockResolvedValue({
      id: 'old',
      name: 'Phil_T',
      email: 'p@x',
      nameNeedsChange: false,
      invisible: true,
      role: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      avatar: { kind: 'none' },
    })
    const res = await a.inject({ method: 'PATCH', url: '/api/me', payload: { invisible: true } })
    expect(res.statusCode).toBe(200)
    expect(setInvisible).toHaveBeenCalledWith({}, 'old', true)
    expect(renameUser).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalledWith('old')
    expect(JSON.parse(res.body).invisible).toBe(true)
  })

  it('sets the avatar to a preset and tells friends and the lobby', async () => {
    const onChanged = vi.fn()
    const onAvatarChanged = vi.fn().mockResolvedValue(undefined)
    const a = createFastify()
    a.register(meApiPlugin, { db: {} as any, deleteAccount, onChanged, onAvatarChanged })
    vi.mocked(setAvatar).mockReset().mockResolvedValue(undefined)
    const res = await a.inject({
      method: 'PATCH',
      url: '/api/me',
      payload: { avatar: { kind: 'preset', foreground: 'chalk', background: 'neon' } },
    })
    expect(res.statusCode).toBe(200)
    expect(setAvatar).toHaveBeenCalledWith({}, 'old', { kind: 'preset', foreground: 'chalk', background: 'neon' })
    expect(onChanged).toHaveBeenCalledWith('old')
    expect(onAvatarChanged).toHaveBeenCalledWith('old')
  })

  it('refuses a picture that is not unlocked yet, on either layer', async () => {
    vi.mocked(setAvatar).mockReset().mockResolvedValue(undefined)
    vi.mocked(hasPerk).mockImplementation((_db, _user, id) => Promise.resolve(id !== 'picture.chrome'))
    for (const avatar of [
      { kind: 'preset', foreground: 'chrome', background: 'classic' },
      { kind: 'preset', foreground: 'classic', background: 'chrome' },
    ]) {
      const res = await app().inject({ method: 'PATCH', url: '/api/me', payload: { avatar } })
      expect(res.statusCode).toBe(409)
    }
    expect(hasPerk).toHaveBeenCalledWith({}, 'old', 'picture.chrome')
    expect(setAvatar).not.toHaveBeenCalled()
  })

  it('lists the pictures you may wear', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/me' })
    expect(JSON.parse(res.body).pictures).toEqual(['classic', 'chalk'])
  })

  it('lets every picture be worn while progression is off', async () => {
    await setupFlags(new Set())
    vi.mocked(setAvatar).mockReset().mockResolvedValue(undefined)
    vi.mocked(hasPerk).mockResolvedValue(false)
    const res = await app().inject({
      method: 'PATCH',
      url: '/api/me',
      payload: { avatar: { kind: 'preset', foreground: 'chrome', background: 'gold' } },
    })
    expect(res.statusCode).toBe(200)
    expect(setAvatar).toHaveBeenCalled()
    expect(JSON.parse(res.body).pictures).toEqual(AVATAR_FINISHES.map(f => f.id))
    expect(unlockedPictures).not.toHaveBeenCalled()
  })

  it('answers 400 for an unknown finish, not 409 even when the other layer is locked', async () => {
    vi.mocked(setAvatar).mockReset().mockRejectedValue(new UnknownAvatarFinishError('nope'))
    vi.mocked(hasPerk).mockResolvedValue(false)
    const res = await app().inject({
      method: 'PATCH',
      url: '/api/me',
      payload: { avatar: { kind: 'preset', foreground: 'gold', background: 'nope' } },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('/api/me/avatar', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0, 0, 0xff, 0xd9])

  beforeEach(async () => {
    vi.mocked(setAvatarUpload).mockReset().mockResolvedValue(undefined)
    await setupFlags(new Set(['avatar.upload.enabled']))
  })
  afterEach(async () => {
    await setupFlags(new Set())
  })

  it('refuses with 403 while avatar.upload.enabled is off', async () => {
    await setupFlags(new Set())
    const res = await app().inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { 'content-type': 'image/jpeg' },
      payload: jpeg,
    })
    expect(res.statusCode).toBe(403)
    expect(setAvatarUpload).not.toHaveBeenCalled()
  })

  it('uploads a JPEG and tells friends', async () => {
    const onChanged = vi.fn()
    const a = createFastify()
    a.register(meApiPlugin, { db: {} as any, deleteAccount, onChanged })
    const res = await a.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { 'content-type': 'image/jpeg' },
      payload: jpeg,
    })
    expect(res.statusCode).toBe(200)
    expect(setAvatarUpload).toHaveBeenCalledWith({}, 'old', jpeg, 'image/jpeg')
    expect(onChanged).toHaveBeenCalledWith('old')
  })

  it("refuses bytes that aren't a JPEG", async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { 'content-type': 'image/jpeg' },
      payload: Buffer.from('not a jpeg'),
    })
    expect(res.statusCode).toBe(400)
    expect(setAvatarUpload).not.toHaveBeenCalled()
  })

  it('refuses a body of a different content type', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { 'content-type': 'image/png' },
      payload: jpeg,
    })
    expect(res.statusCode).toBe(415)
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
