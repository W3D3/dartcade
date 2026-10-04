import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { FriendsService } from './service.js'
import { LobbyHub } from '../lobby/hub.js'

const user = (id: string, name: string, flagged = false) =>
  ({ id, name, email: `${id}@example.com`, emailVerified: false, image: null, name_needs_change: flagged })

describe.skipIf(!process.env.TEST_DATABASE_URL)('FriendsService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let friends: FriendsService
  let hub: LobbyHub
  const games = new Map<string, { gameId: string }>()
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
    await db.deleteFrom('lobby_invites').execute()
    await db.deleteFrom('lobby_people').execute()
    await db.deleteFrom('lobbies').execute()
    await db.updateTable('user').set({ invisible: false }).execute()
    onChange.mockReset()
    games.clear()
    hub = new LobbyHub()
    friends = new FriendsService({ db, onChange, hub, gameOf: u => games.get(u) ?? null, debounceMs: 5, graceMs: 20 })
  })
  afterEach(async () => {
    await friends.flush()
    friends.close()
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
    expect((await friends.list('chris')).friends).toMatchObject([{ id: 'lena', name: 'Lena', friendsSince: expect.any(String) }])
    expect((await friends.list('lena')).friends).toMatchObject([{ id: 'chris', name: 'Christoph', friendsSince: expect.any(String) }])
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

  const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
  const meMsg = { type: 'me' as const, invites: [], lobby: null, game: null }
  const last = (ws: { send: { mock: { calls: unknown[][] } } }) => JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))
  async function open(userId: string) {
    const ws = sock()
    hub.addMeSocket(userId, ws, meMsg, await friends.message(userId))
    friends.connected(userId)
    await friends.flush()
    return ws
  }
  const befriend = async (a: string, b: string) => friends.accept(b, (await friends.request(a, (await db.selectFrom('user').select('name').where('id', '=', b).executeTakeFirstOrThrow()).name)).id)
  async function openLobby(id: string, hostUserId: string, access: 'friends' | 'invite', members: string[]) {
    await db.insertInto('lobbies').values({ id, name: 'Friday darts', host_user_id: hostUserId, code: id.toUpperCase().padEnd(6, 'X'), access }).execute()
    for (const [i, userId] of members.entries()) {
      await db.insertInto('lobby_people').values({ id: `${id}-${userId}`, lobby_id: id, user_id: userId, added_by_user_id: userId, name: userId, board_id: null, position: i, board_moved_by: null }).execute()
    }
  }

  describe('live lists', () => {
    it('sends your list when /ws/me opens, and pushes status changes only to friends', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      const max = await open('max')
      expect(last(chris)).toMatchObject({ type: 'friends', friends: [{ id: 'lena', status: { kind: 'offline' } }] })
      await open('lena')
      expect(last(chris).friends[0].status).toEqual({ kind: 'online' })
      expect(max.send).toHaveBeenCalledTimes(2)   // its me and friends messages on connect, nothing since
    })

    it('playing over lobby over online; Invisible shows offline', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      await openLobby('l1', 'lena', 'friends', ['lena'])
      friends.touch(['lena'])
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'lobby', lobbyId: 'l1', lobbyName: 'Friday darts', joinable: true })
      games.set('lena', { gameId: 'x01' })
      friends.touch(['lena'])
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'playing', gameId: 'x01' })
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.touch(['lena'])
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'offline' })
      await db.updateTable('user').set({ invisible: false }).where('id', '=', 'lena').execute()
    })

    it('a friend in your lobby shows there even while Invisible; one you invited shows invited', async () => {
      await befriend('chris', 'lena')
      await befriend('chris', 'max')
      await openLobby('l2', 'chris', 'friends', ['chris', 'lena'])
      await db.insertInto('lobby_invites').values({ id: 'i1', lobby_id: 'l2', invitee_user_id: 'max', inviter_user_id: 'chris' }).execute()
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      const list = await friends.list('chris')
      expect(list.friends.map(f => [f.id, f.status.kind, f.inYourLobby, f.invited])).toEqual([['lena', 'offline', true, false], ['max', 'offline', false, true]])
      await db.updateTable('user').set({ invisible: false }).where('id', '=', 'lena').execute()
    })

    it('goes offline for friends after the grace', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      friends.disconnected('lena')
      await new Promise(r => setTimeout(r, 40))
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'offline' })
    })

    it('two tabs and one closes, or a reload within the grace: friends never see offline', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      await open('lena')
      const sent = chris.send.mock.calls.length
      friends.disconnected('lena')   // one of two tabs
      await new Promise(r => setTimeout(r, 40))
      friends.disconnected('lena')   // the other one reloads...
      await new Promise(r => setTimeout(r, 5))
      friends.connected('lena')      // ...and is back within the grace
      await new Promise(r => setTimeout(r, 40))
      await friends.flush()
      expect(friends.isOnline('lena')).toBe(true)
      expect(chris.send).toHaveBeenCalledTimes(sent)
      expect(last(chris).friends[0].status).toEqual({ kind: 'online' })
    })

    it('a second tab opened while a push is pending: the first tab still gets the change', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.touch(['lena'])                 // chris's push is now pending
      await new Promise(r => setTimeout(r, 1))
      const tab2 = sock()
      hub.addMeSocket('chris', tab2, meMsg, await friends.message('chris'))   // already the new list
      friends.connected('chris')
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'offline' })
      expect(last(tab2).friends[0].status).toEqual({ kind: 'offline' })
    })

    it('a reload inside the grace: a change between building its list and the socket opening still reaches it', async () => {
      friends.close()
      friends = new FriendsService({ db, hub, gameOf: u => games.get(u) ?? null, debounceMs: 5, graceMs: 10_000 })
      await befriend('chris', 'lena')
      await open('lena')
      const before = await open('chris')
      hub.removeMeSocket('chris', before)
      friends.disconnected('chris')                   // reloading: still online for the grace
      const first = await friends.message('chris')   // lena online
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.touch(['lena'])                          // chris has no /ws/me right now: nothing to push
      await friends.flush()
      const chris = sock()
      hub.addMeSocket('chris', chris, meMsg, first)
      friends.connected('chris')
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'offline' })
    })

    it('pushes for one user go out in order, even when an earlier build is slow', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      const real = friends.message.bind(friends)
      let calls = 0
      vi.spyOn(friends, 'message').mockImplementation(async userId => {
        const msg = await real(userId)
        if (calls++ === 0) await new Promise(r => setTimeout(r, 50))   // the first build is slow
        return msg
      })
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.refresh(['chris'])
      await new Promise(r => setTimeout(r, 15))   // the first push has started building
      await db.updateTable('user').set({ invisible: false }).where('id', '=', 'lena').execute()
      friends.refresh(['chris'])
      await friends.flush()
      expect(calls).toBe(2)
      expect(last(chris).friends[0].status).toEqual({ kind: 'online' })
    })

    it('requests and answers reach both sides', async () => {
      const chris = await open('chris')
      const lena = await open('lena')
      const r = await friends.request('chris', 'Lena')
      await friends.flush()
      expect(last(chris).outgoing).toHaveLength(1)
      expect(last(lena).incoming).toHaveLength(1)
      await friends.decline('lena', r.id)
      await friends.flush()
      expect(last(chris).outgoing).toEqual([])
    })

    it('close stops pending pushes and grace timers', async () => {
      await befriend('chris', 'lena')
      const chris = await open('chris')
      await open('lena')
      const sent = chris.send.mock.calls.length
      friends.disconnected('lena')
      friends.refresh(['chris'])
      friends.close()
      friends.disconnected('chris')
      await new Promise(r => setTimeout(r, 40))
      await friends.flush()
      expect(chris.send).toHaveBeenCalledTimes(sent)
    })
  })
})
