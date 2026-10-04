import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { FriendsService } from './service.js'

const user = (id: string, name: string, flagged = false) =>
  ({ id, name, email: `${id}@example.com`, emailVerified: false, image: null, name_needs_change: flagged })

describe.skipIf(!process.env.TEST_DATABASE_URL)('FriendsService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let friends: FriendsService
  const onChange = vi.fn()

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('friends_service_test'))
    await db.insertInto('user').values([
      user('chris', 'Christoph'), user('lena', 'Lena'), user('max', 'Max'), user('sam', 'sam.180'), user('oldlena', 'LENA', true),
    ]).execute()
  })
  afterAll(async () => { await close() })
  beforeEach(async () => {
    await db.deleteFrom('friendships').execute()
    onChange.mockReset()
    friends = new FriendsService({ db, onChange })
  })

  it('sends a request by exact name, any case, with spaces or an @ around', async () => {
    const r = await friends.request('chris', '  @lena ')
    expect(r).toEqual({ id: expect.any(String), status: 'pending' })
    expect(onChange).toHaveBeenCalledWith(['chris', 'lena'])
    expect((await friends.list('chris')).outgoing).toEqual([{ id: r.id, to: { id: 'lena', name: 'Lena' }, createdAt: expect.any(String) }])
    expect((await friends.list('lena')).incoming).toEqual([{ id: r.id, from: { id: 'chris', name: 'Christoph' }, mutualFriends: 0, createdAt: expect.any(String) }])
    expect((await friends.list('oldlena')).incoming).toEqual([])
  })

  it('refuses yourself, an unknown name, a pending request and an existing friendship, both ways', async () => {
    await expect(friends.request('chris', 'christoph')).rejects.toMatchObject({ statusCode: 400, body: { error: "You can't add yourself" } })
    await expect(friends.request('chris', 'Nobody')).rejects.toMatchObject({ statusCode: 404, body: { error: 'No player called Nobody' } })
    const r = await friends.request('chris', 'Lena')
    await expect(friends.request('chris', 'Lena')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_requested', error: 'Request already sent' } })
    await friends.accept('lena', r.id)
    await expect(friends.request('chris', 'Lena')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_friends', error: "You're already friends" } })
    await expect(friends.request('lena', 'Christoph')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_friends' } })
  })

  it('a request to someone who already asked you accepts theirs', async () => {
    const theirs = await friends.request('lena', 'Christoph')
    expect(await friends.request('chris', 'Lena')).toEqual({ id: theirs.id, status: 'accepted' })
    expect((await friends.list('chris')).friends).toEqual([{ id: 'lena', name: 'Lena', friendsSince: expect.any(String) }])
    expect((await friends.list('lena')).friends).toEqual([{ id: 'chris', name: 'Christoph', friendsSince: expect.any(String) }])
  })

  it('two crossing requests at once end in one friendship', async () => {
    const results = await Promise.all([friends.request('chris', 'Lena'), friends.request('lena', 'Christoph')])
    expect(results.map(r => r.status).sort()).toEqual(['accepted', 'pending'])
    expect(await db.selectFrom('friendships').select('status').execute()).toEqual([{ status: 'accepted' }])
  })

  it("accept and decline are the addressee's; decline deletes it quietly and they may ask again", async () => {
    const r = await friends.request('chris', 'Lena')
    await expect(friends.accept('chris', r.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(friends.decline('max', r.id)).rejects.toMatchObject({ statusCode: 404 })
    await friends.decline('lena', r.id)
    expect((await friends.list('chris')).outgoing).toEqual([])
    expect((await friends.request('chris', 'Lena')).status).toBe('pending')
  })

  it("cancel is the requester's", async () => {
    const r = await friends.request('chris', 'Lena')
    await expect(friends.cancel('lena', r.id)).rejects.toMatchObject({ statusCode: 404 })
    await friends.cancel('chris', r.id)
    expect((await friends.list('lena')).incoming).toEqual([])
  })

  it('either side removes the friendship', async () => {
    const r = await friends.request('chris', 'Lena')
    await friends.accept('lena', r.id)
    await friends.remove('lena', 'chris')
    expect((await friends.list('chris')).friends).toEqual([])
    await expect(friends.remove('chris', 'lena')).rejects.toMatchObject({ statusCode: 404 })
    expect(onChange).toHaveBeenLastCalledWith(['lena', 'chris'])
  })

  it('counts friends in common on requests for you', async () => {
    await friends.accept('lena', (await friends.request('chris', 'Lena')).id)
    await friends.accept('lena', (await friends.request('max', 'Lena')).id)
    await friends.request('max', 'Christoph')
    expect((await friends.list('chris')).incoming).toMatchObject([{ from: { id: 'max' }, mutualFriends: 1 }])
  })
})
