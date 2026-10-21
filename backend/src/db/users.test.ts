import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { AVATAR_COLORS, DEFAULT_AVATAR_BG, DEFAULT_AVATAR_FG, DEFAULT_AVATAR_PRESET } from '../shared/avatarPresets.js'
import { getAccount, getAvatarUpload, setAvatar, setAvatarUpload, UnknownAvatarColorError, UnknownAvatarPresetError } from './users.js'

const user = (id: string, name: string) => ({
  id,
  name,
  email: `${id}@example.com`,
  emailVerified: false,
  image: null,
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('avatar', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('avatar_test'))
    await db
      .insertInto('user')
      .values([user('lena', 'Lena')])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it('starts on the Dartcade mark, grey on black, with version 0', async () => {
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: DEFAULT_AVATAR_PRESET,
      color: DEFAULT_AVATAR_BG,
      fgColor: DEFAULT_AVATAR_FG,
    })
    expect(await getAvatarUpload(db, 'lena')).toBeUndefined()
  })

  it('sets the background and foreground colours, bumping the version each time', async () => {
    await setAvatar(db, 'lena', { kind: 'preset', preset: 'logo', color: AVATAR_COLORS[0], fgColor: AVATAR_COLORS[1] })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: 'logo',
      color: AVATAR_COLORS[0],
      fgColor: AVATAR_COLORS[1],
    })
    await setAvatar(db, 'lena', { kind: 'preset', preset: 'logo', color: AVATAR_COLORS[2], fgColor: AVATAR_COLORS[3] })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: 'logo',
      color: AVATAR_COLORS[2],
      fgColor: AVATAR_COLORS[3],
    })
  })

  it('lets the background and foreground colour change independently', async () => {
    await setAvatar(db, 'lena', { kind: 'preset', preset: 'logo', color: AVATAR_COLORS[4], fgColor: AVATAR_COLORS[3] })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: 'logo',
      color: AVATAR_COLORS[4],
      fgColor: AVATAR_COLORS[3],
    })
  })

  it('refuses an unknown preset id, leaving the avatar as it was', async () => {
    await expect(
      setAvatar(db, 'lena', { kind: 'preset', preset: 'nope', color: AVATAR_COLORS[0], fgColor: AVATAR_COLORS[1] }),
    ).rejects.toThrow(UnknownAvatarPresetError)
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: 'logo',
      color: AVATAR_COLORS[4],
      fgColor: AVATAR_COLORS[3],
    })
  })

  it('refuses an unknown background or foreground colour, leaving the avatar as it was', async () => {
    await expect(setAvatar(db, 'lena', { kind: 'preset', preset: 'logo', color: '#abcdef', fgColor: AVATAR_COLORS[0] })).rejects.toThrow(
      UnknownAvatarColorError,
    )
    await expect(setAvatar(db, 'lena', { kind: 'preset', preset: 'logo', color: AVATAR_COLORS[0], fgColor: '#abcdef' })).rejects.toThrow(
      UnknownAvatarColorError,
    )
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({
      kind: 'preset',
      preset: 'logo',
      color: AVATAR_COLORS[4],
      fgColor: AVATAR_COLORS[3],
    })
  })

  it('uploads a photo, serving it back with a bumped version; a preset or none clears the bytes', async () => {
    await setAvatarUpload(db, 'lena', Buffer.from([1, 2, 3]), 'image/jpeg')
    const account = await getAccount(db, 'lena')
    expect(account?.avatar.kind).toBe('upload')
    const upload = await getAvatarUpload(db, 'lena')
    expect(upload).toEqual({ image: Buffer.from([1, 2, 3]), contentType: 'image/jpeg', version: expect.any(Number) })

    await setAvatar(db, 'lena', { kind: 'none' })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({ kind: 'none' })
    expect(await getAvatarUpload(db, 'lena')).toBeUndefined()
  })
})
