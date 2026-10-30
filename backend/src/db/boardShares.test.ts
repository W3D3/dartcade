import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import {
  insertBoardShareInvite, getBoardShare, acceptBoardShare, deleteBoardShare,
  hasAcceptedBoardShare, sharedFriendIdsOfBoard, granteesOfBoard, incomingSharesFor, sharedBoardsFor,
} from './boardShares.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('board shares', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('board_shares_test'))
    await db.insertInto('user').values([
      { id: 'chris', name: 'Christoph', email: 'c@x', emailVerified: false, image: null },
      { id: 'lena', name: 'Lena', email: 'l@x', emailVerified: false, image: null },
      { id: 'max', name: 'Max', email: 'm@x', emailVerified: false, image: null },
      { id: 'anna', name: 'Anna', email: 'a@x', emailVerified: false, image: null },
    ]).execute()
    await db.insertInto('boards').values([
      { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h1' },
      { id: 'kitchen', owner_user_id: 'chris', name: 'Kitchen', token_hash: 'h2' },
    ]).execute()
  })
  afterAll(async () => { await close() })

  it('a board can have more than one grantee, pending and accepted independently', async () => {
    const toLena = await insertBoardShareInvite(db, 'living', 'lena')
    const toMax = await insertBoardShareInvite(db, 'living', 'max')
    expect(await acceptBoardShare(db, toLena.id, new Date())).toBe(true)

    expect(await hasAcceptedBoardShare(db, 'living', 'lena')).toBe(true)
    expect(await hasAcceptedBoardShare(db, 'living', 'max')).toBe(false)
    expect(await sharedFriendIdsOfBoard(db, 'living')).toEqual(['lena'])

    const grantees = await granteesOfBoard(db, 'living')
    expect(grantees.map(g => [g.friendUserId, g.status])).toEqual(
      expect.arrayContaining([['lena', 'accepted'], ['max', 'pending']]),
    )

    expect(await incomingSharesFor(db, 'max')).toEqual([
      expect.objectContaining({ id: toMax.id, boardId: 'living', boardName: 'Living room', ownerUserId: 'chris', ownerName: 'Christoph' }),
    ])
    expect(await incomingSharesFor(db, 'lena')).toEqual([]) // already accepted, not "incoming" any more

    expect(await sharedBoardsFor(db, 'lena')).toEqual([
      expect.objectContaining({ id: 'living', name: 'Living room', owner_name: 'Christoph' }),
    ])
    expect(await sharedBoardsFor(db, 'max')).toEqual([]) // still pending
  })

  it('accepting or deleting twice: the second call reports it did nothing', async () => {
    const share = await insertBoardShareInvite(db, 'living', 'anna')
    expect(await acceptBoardShare(db, share.id, new Date())).toBe(true)
    expect(await acceptBoardShare(db, share.id, new Date())).toBe(false)
    expect(await deleteBoardShare(db, share.id)).toBe(true)
    expect(await deleteBoardShare(db, share.id)).toBe(false)
    expect(await getBoardShare(db, share.id)).toBeUndefined()
  })

  it('refuses a second invite for the same board and friend', async () => {
    await insertBoardShareInvite(db, 'kitchen', 'lena')
    await expect(insertBoardShareInvite(db, 'kitchen', 'lena')).rejects.toMatchObject({ code: '23505' })
  })
})
