import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { getBoardForBridgeKey, insertBridgeKey } from './queries.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('bridge keys', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('bridge_keys_test'))
    for (const id of ['u1', 'u2']) {
      await db
        .insertInto('user')
        .values({ id, name: id, email: `${id}@example.com`, emailVerified: false, image: null })
        .execute()
    }
    await insertBridgeKey(db, { id: 'k1', user_id: 'u1', token_hash: 'h1' })
    await insertBridgeKey(db, { id: 'k2', user_id: 'u2', token_hash: 'h2' })
  })
  afterAll(async () => {
    await close()
  })

  it("makes the key owner's board on a bridge's first connect, and finds it again", async () => {
    const first = await getBoardForBridgeKey(db, 'h1', 'bridge-a')
    expect(first).toMatchObject({ owner_user_id: 'u1', bridge_id: 'bridge-a', name: 'New board' })
    expect((await getBoardForBridgeKey(db, 'h1', 'bridge-a'))?.id).toBe(first?.id)
  })

  it('gives each bridge sharing a key its own board, and each user theirs', async () => {
    const a = await getBoardForBridgeKey(db, 'h1', 'bridge-a')
    const b = await getBoardForBridgeKey(db, 'h1', 'bridge-b')
    const other = await getBoardForBridgeKey(db, 'h2', 'bridge-a')
    expect(new Set([a?.id, b?.id, other?.id]).size).toBe(3)
  })

  it('knows no board for an unknown key', async () => {
    expect(await getBoardForBridgeKey(db, 'nope', 'bridge-a')).toBeUndefined()
  })

  it('makes one board when the same bridge connects twice at once', async () => {
    const [a, b] = await Promise.all([getBoardForBridgeKey(db, 'h2', 'bridge-race'), getBoardForBridgeKey(db, 'h2', 'bridge-race')])
    expect(a?.id).toBe(b?.id)
  })
})
