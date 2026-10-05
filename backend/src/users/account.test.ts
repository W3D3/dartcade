import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { getAccount } from '../db/users.js'
import { checkName, renameUser, suggestName } from './account.js'

const user = (id: string, name: string, flagged = false) => ({
  id,
  name,
  email: `${id}@example.com`,
  emailVerified: false,
  image: null,
  name_needs_change: flagged,
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('account names', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('account_names_test'))
    await db
      .insertInto('user')
      .values([
        user('luke', 'luke'),
        user('jurgen', 'Jürgen'),
        user('phil', 'Phil.Taylor'),
        user('old', 'Phil Taylor', true),
        user('dup', 'LUKE', true),
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it('your own name, in any case, is free for you', async () => {
    expect(await checkName(db, 'Luke', 'luke')).toEqual({ ok: true, name: 'Luke' })
    expect(await checkName(db, 'Luke', 'phil')).toEqual({ ok: false, reason: 'taken' })
    expect(await checkName(db, 'Luke', null)).toEqual({ ok: false, reason: 'taken' })
  })

  it('a decomposed ü, another case or spaces around are the same name', async () => {
    expect(await checkName(db, '  jürgen ', null)).toEqual({ ok: false, reason: 'taken' })
    expect(await checkName(db, 'Jürgen', 'jurgen')).toEqual({ ok: true, name: 'Jürgen' })
  })

  it('flagged names hold nothing; rule breakers are invalid', async () => {
    expect(await checkName(db, 'phil taylor', null)).toEqual({ ok: false, reason: 'invalid' })
    expect(await checkName(db, 'Phil_Taylor', null)).toEqual({ ok: true, name: 'Phil_Taylor' })
  })

  it('suggests the cleaned name, numbered until it is free', async () => {
    expect(await suggestName(db, 'Phil Taylor', 'old')).toBe('Phil.Taylor2')
    expect(await suggestName(db, 'LUKE', 'dup')).toBe('LUKE2')
    expect(await suggestName(db, 'Zoë!!', 'old')).toBe('Zoë')
  })

  it('renames, clearing the flag; refuses taken and invalid names', async () => {
    expect(await renameUser(db, 'old', ' Phil_T ')).toBe('Phil_T')
    expect(await getAccount(db, 'old')).toEqual({
      id: 'old',
      name: 'Phil_T',
      email: 'old@example.com',
      nameNeedsChange: false,
      invisible: false,
    })
    await expect(renameUser(db, 'dup', 'luke')).rejects.toMatchObject({ statusCode: 409, body: { error: 'That name is taken' } })
    await expect(renameUser(db, 'dup', 'l u k e')).rejects.toMatchObject({ statusCode: 400 })
  })
})
