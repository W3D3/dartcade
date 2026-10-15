import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { getPreferences, updatePreferences } from './users.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('account preferences', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('preferences_db_test'))
    await db
      .insertInto('user')
      .values([
        { id: 'a', name: 'Anna', email: 'a@example.com', emailVerified: false, image: null },
        { id: 'b', name: 'Ben', email: 'b@example.com', emailVerified: false, image: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  it('starts empty, merges each update over the stored ones and keeps accounts apart', async () => {
    expect(await getPreferences(db, 'a')).toEqual({})
    await updatePreferences(db, 'a', { chalkboard: false, x01StartScore: 301, callerVoice: 'builtin:calm' })
    const now = await updatePreferences(db, 'a', { x01StartScore: 701, callerVoice: null })
    expect(now).toEqual({ chalkboard: false, x01StartScore: 701, callerVoice: null })
    expect(await getPreferences(db, 'a')).toEqual(now)
    expect(await getPreferences(db, 'b')).toEqual({})
    expect(await getPreferences(db, 'nobody')).toBeUndefined()
  })
})
