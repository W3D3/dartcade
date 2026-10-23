import type { Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { exchangeBridgeInstallToken, getBoardByTokenHash, insertBridgeInstallToken } from './queries.js'
import { hashBoardToken } from '../boards/token.js'

const minutes = (n: number) => new Date(Date.now() + n * 60_000)

describe.skipIf(!process.env.TEST_DATABASE_URL)('bridge install tokens', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('bridge_install_tokens_test'))
    await db.insertInto('user').values({ id: 'u1', name: 'u1', email: 'u1@example.com', emailVerified: false, image: null }).execute()
  })
  afterAll(async () => {
    await close()
  })

  it("swaps the token for the owner's new board, whose token then signs in", async () => {
    await insertBridgeInstallToken(db, { token_hash: 'h1', user_id: 'u1', expires_at: minutes(15) })
    const boardToken = await exchangeBridgeInstallToken(db, 'h1')
    expect(boardToken).toBeTruthy()
    expect(await getBoardByTokenHash(db, hashBoardToken(boardToken!))).toMatchObject({ owner_user_id: 'u1', name: 'New board' })
  })

  it('works once only', async () => {
    await insertBridgeInstallToken(db, { token_hash: 'h2', user_id: 'u1', expires_at: minutes(15) })
    expect(await exchangeBridgeInstallToken(db, 'h2')).toBeTruthy()
    expect(await exchangeBridgeInstallToken(db, 'h2')).toBeUndefined()
  })

  it('makes one board when two bridges race for the same token', async () => {
    await insertBridgeInstallToken(db, { token_hash: 'h3', user_id: 'u1', expires_at: minutes(15) })
    const results = await Promise.all([exchangeBridgeInstallToken(db, 'h3'), exchangeBridgeInstallToken(db, 'h3')])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('refuses an expired or unknown token', async () => {
    await insertBridgeInstallToken(db, { token_hash: 'old', user_id: 'u1', expires_at: minutes(-1) })
    expect(await exchangeBridgeInstallToken(db, 'old')).toBeUndefined()
    expect(await exchangeBridgeInstallToken(db, 'nope')).toBeUndefined()
  })
})
