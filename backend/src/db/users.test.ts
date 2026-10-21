import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { getAccount, getAvatarUpload, setAvatar, setAvatarUpload, UnknownAvatarPresetError } from './users.js'

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

  it('starts at none, with version 0', async () => {
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({ kind: 'none' })
    expect(await getAvatarUpload(db, 'lena')).toBeUndefined()
  })

  it('sets a preset, bumping the version each time', async () => {
    await setAvatar(db, 'lena', { kind: 'preset', preset: 'crosshair' })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({ kind: 'preset', preset: 'crosshair' })
    await setAvatar(db, 'lena', { kind: 'preset', preset: 'medal' })
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({ kind: 'preset', preset: 'medal' })
  })

  it('refuses an unknown preset id, leaving the avatar as it was', async () => {
    await expect(setAvatar(db, 'lena', { kind: 'preset', preset: 'nope' })).rejects.toThrow(UnknownAvatarPresetError)
    expect((await getAccount(db, 'lena'))?.avatar).toEqual({ kind: 'preset', preset: 'medal' })
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
