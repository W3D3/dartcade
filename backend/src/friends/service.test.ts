import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { FriendsService } from './service.js'
import { LobbyHub } from '../lobby/hub.js'
import { DEFAULT_AVATAR_FINISH } from '../shared/avatarFinishes.js'
import { insertUsers } from '../test/fixtures.js'

const defaultAvatar = { kind: 'preset' as const, foreground: DEFAULT_AVATAR_FINISH, background: DEFAULT_AVATAR_FINISH }

describe.skipIf(!process.env.TEST_DATABASE_URL)('FriendsService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let friends: FriendsService
  let hub: LobbyHub
  const games = new Map<string, { gameId: string }>()
  const onChange = vi.fn()

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('friends_service_test'))
    await insertUsers(db, [
      { id: 'chris', name: 'Christoph' },
      { id: 'lena', name: 'Lena' },
      { id: 'max', name: 'Max' },
      { id: 'sam', name: 'sam.180' },
      { id: 'oldlena', name: 'LENA', name_needs_change: true },
    ])
  })
  afterAll(async () => {
    await close()
  })
  beforeEach(async () => {
    await db.deleteFrom('friendships').execute()
    await db.deleteFrom('lobby_invites').execute()
    await db.deleteFrom('lobby_people').execute()
    await db.deleteFrom('lobbies').execute()
    await db
      .updateTable('user')
      .set({ invisible: false, show_last_online: 'friends', friends_visibility: 'friends', last_seen_at: null })
      .execute()
    onChange.mockReset()
    games.clear()
    hub = new LobbyHub()
    friends = new FriendsService({ db, onChange, hub, gameOf: u => games.get(u) ?? null, debounceMs: 5, graceMs: 20 })
  })
  afterEach(async () => {
    await friends.flush()
    await friends.close()
  })

  describe('search', () => {
    const names = async (who: string, term: string) => (await friends.search(who, term)).map(u => u.name)

    it('finds part of a name from three characters, names starting with it first', async () => {
      expect(await names('chris', 'len')).toEqual(['Lena'])
      expect(await names('chris', '@LEN')).toEqual(['Lena'])
      expect(await names('chris', 'le')).toEqual([])
      expect(await names('chris', 'am.')).toEqual(['sam.180'])
      expect(await names('chris', '%%%')).toEqual([])
    })

    it('finds an exact email only, any case', async () => {
      expect(await names('chris', 'MAX@example.com')).toEqual(['Max'])
      expect(await names('chris', 'ax@example.com')).toEqual([])
      expect(await names('chris', 'max@example')).toEqual([])
    })

    it('leaves out yourself and flagged names, and caps the list', async () => {
      expect(await names('chris', 'christoph')).toEqual([])
      expect(await names('chris', 'lena')).toEqual(['Lena']) // not the flagged LENA
      await insertUsers(
        db,
        Array.from({ length: 12 }, (_, i) => ({ id: `bulk${i}`, name: `bulk.${String(i).padStart(2, '0')}` })),
      )
      expect(await friends.search('chris', 'bulk')).toHaveLength(10)
      await db.deleteFrom('user').where('id', 'like', 'bulk%').execute()
    })

    it('finds someone who is not discoverable only by their exact name', async () => {
      await db.updateTable('user').set({ discoverable: false }).where('id', '=', 'sam').execute()
      try {
        expect(await names('chris', 'am.1')).toEqual([])
        expect(await names('chris', 'sam@example.com')).toEqual([])
        expect(await names('chris', 'SAM.180')).toEqual(['sam.180'])
      } finally {
        await db.updateTable('user').set({ discoverable: true }).where('id', '=', 'sam').execute()
      }
    })

    it('suggests friends of friends, the most in common first, never friends, requests or the undiscoverable', async () => {
      const ask = async (from: string, to: string) => friends.accept(to, (await friends.request(from, await names2(to))).id)
      const names2 = async (id: string) => (await db.selectFrom('user').select('name').where('id', '=', id).executeTakeFirstOrThrow()).name
      await ask('chris', 'lena')
      await ask('chris', 'max')
      await ask('lena', 'sam')
      await ask('max', 'sam')
      expect(await friends.suggestions('chris')).toMatchObject([{ id: 'sam', request: 'none', mutualFriends: 2 }])
      await db.updateTable('user').set({ discoverable: false }).where('id', '=', 'sam').execute()
      expect(await friends.suggestions('chris')).toEqual([])
      await db.updateTable('user').set({ discoverable: true }).where('id', '=', 'sam').execute()
      await friends.request('chris', 'sam.180')
      expect(await friends.suggestions('chris')).toEqual([])
    })

    it('marks friends', async () => {
      const r = await friends.request('chris', 'Max')
      await friends.accept('max', r.id)
      expect(await friends.search('chris', 'max')).toMatchObject([{ id: 'max', request: 'friends' }])
    })

    it('shows an open request and the friends in common', async () => {
      const toLena = await friends.request('chris', 'Lena')
      const toMax = await friends.request('max', 'Christoph')
      expect(await friends.search('chris', 'lena')).toMatchObject([{ id: 'lena', request: 'sent', mutualFriends: 0 }])
      expect(await friends.search('chris', 'max')).toMatchObject([{ id: 'max', request: 'received' }])
      expect(await friends.search('lena', 'christoph')).toMatchObject([{ id: 'chris', request: 'received' }])
      await friends.accept('lena', toLena.id)
      await friends.accept('chris', toMax.id)
      // sam asks lena: lena is the friend sam and chris share
      const r = await friends.request('sam', 'Lena')
      await friends.accept('lena', r.id)
      expect(await friends.search('chris', 'sam.180')).toMatchObject([{ id: 'sam', request: 'none', mutualFriends: 1 }])
    })
  })

  it('sends a request by exact name, any case, with spaces or an @ around', async () => {
    const r = await friends.request('chris', '  @lena ')
    expect(r).toEqual({ id: expect.any(String), status: 'pending' })
    expect(onChange).toHaveBeenCalledWith(['chris', 'lena'])
    expect((await friends.list('chris')).outgoing).toEqual([
      { id: r.id, to: { id: 'lena', name: 'Lena', avatar: defaultAvatar }, createdAt: expect.any(String) },
    ])
    expect((await friends.list('lena')).incoming).toEqual([
      { id: r.id, from: { id: 'chris', name: 'Christoph', avatar: defaultAvatar }, mutualFriends: 0, createdAt: expect.any(String) },
    ])
    expect((await friends.list('oldlena')).incoming).toEqual([])
  })

  it('refuses yourself, an unknown name, a pending request and an existing friendship, both ways', async () => {
    await expect(friends.request('chris', 'christoph')).rejects.toMatchObject({
      statusCode: 400,
      body: { error: "You can't add yourself" },
    })
    await expect(friends.request('chris', 'Nobody')).rejects.toMatchObject({ statusCode: 404, body: { error: 'No player called Nobody' } })
    const r = await friends.request('chris', 'Lena')
    await expect(friends.request('chris', 'Lena')).rejects.toMatchObject({
      statusCode: 409,
      body: { code: 'already_requested', error: 'Request already sent' },
    })
    await friends.accept('lena', r.id)
    await expect(friends.request('chris', 'Lena')).rejects.toMatchObject({
      statusCode: 409,
      body: { code: 'already_friends', error: "You're already friends" },
    })
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
  const befriend = async (a: string, b: string) =>
    friends.accept(
      b,
      (await friends.request(a, (await db.selectFrom('user').select('name').where('id', '=', b).executeTakeFirstOrThrow()).name)).id,
    )
  async function openLobby(id: string, hostUserId: string, access: 'friends' | 'invite', members: string[]) {
    await db
      .insertInto('lobbies')
      .values({ id, name: 'Friday darts', host_user_id: hostUserId, code: id.toUpperCase().padEnd(6, 'X'), access })
      .execute()
    for (const [i, userId] of members.entries()) {
      await db
        .insertInto('lobby_people')
        .values({
          id: `${id}-${userId}`,
          lobby_id: id,
          user_id: userId,
          added_by_user_id: userId,
          name: userId,
          board_id: null,
          position: i,
          board_moved_by: null,
        })
        .execute()
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
      expect(max.send).toHaveBeenCalledTimes(2) // its me and friends messages on connect, nothing since
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
      expect(list.friends.map(f => [f.id, f.status.kind, f.inYourLobby, f.invited])).toEqual([
        ['lena', 'offline', true, false],
        ['max', 'offline', false, true],
      ])
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
      friends.disconnected('lena') // one of two tabs
      await new Promise(r => setTimeout(r, 40))
      friends.disconnected('lena') // the other one reloads...
      await new Promise(r => setTimeout(r, 5))
      friends.connected('lena') // ...and is back within the grace
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
      friends.touch(['lena']) // chris's push is now pending
      await new Promise(r => setTimeout(r, 1))
      const tab2 = sock()
      hub.addMeSocket('chris', tab2, meMsg, await friends.message('chris')) // already the new list
      friends.connected('chris')
      await friends.flush()
      expect(last(chris).friends[0].status).toEqual({ kind: 'offline' })
      expect(last(tab2).friends[0].status).toEqual({ kind: 'offline' })
    })

    it('a reload inside the grace: a change between building its list and the socket opening still reaches it', async () => {
      await friends.close()
      friends = new FriendsService({ db, hub, gameOf: u => games.get(u) ?? null, debounceMs: 5, graceMs: 10_000 })
      await befriend('chris', 'lena')
      await open('lena')
      const before = await open('chris')
      hub.removeMeSocket('chris', before)
      friends.disconnected('chris') // reloading: still online for the grace
      const first = await friends.message('chris') // lena online
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.touch(['lena']) // chris has no /ws/me right now: nothing to push
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
        if (calls++ === 0) await new Promise(r => setTimeout(r, 50)) // the first build is slow
        return msg
      })
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      friends.refresh(['chris'])
      await new Promise(r => setTimeout(r, 15)) // the first push has started building
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
      await friends.close()
      friends.disconnected('chris')
      await new Promise(r => setTimeout(r, 40))
      await friends.flush()
      expect(chris.send).toHaveBeenCalledTimes(sent)
    })
  })

  describe('last online and friends of friends', () => {
    const befriend = async (a: string, b: string) => {
      const names: Record<string, string> = { chris: 'Christoph', lena: 'Lena', max: 'Max', sam: 'sam.180' }
      const r = await friends.request(a, names[b] ?? b)
      await friends.accept(b, r.id)
    }
    const seen = (id: string, ago: number) =>
      db
        .updateTable('user')
        .set({ last_seen_at: new Date(Date.now() - ago) })
        .where('id', '=', id)
        .execute()
    const H = 3_600_000
    const lastSeenOf = async (viewer: string, id: string) => (await friends.list(viewer)).friends.find(f => f.id === id)?.lastSeen

    it('shows an offline friend a coarse bucket, never to non-friends', async () => {
      await befriend('chris', 'lena')
      await seen('lena', 3 * H)
      expect(await lastSeenOf('chris', 'lena')).toBe('today')
      await seen('lena', 30 * H)
      expect(await lastSeenOf('chris', 'lena')).toBe('yesterday')
      await seen('lena', 100 * H)
      expect(await lastSeenOf('chris', 'lena')).toBe('week')
      await seen('lena', 400 * H)
      expect(await lastSeenOf('chris', 'lena')).toBe('older')
      expect((await friends.playerFriends('max', 'lena')).lastSeen).toBeUndefined()
      expect((await friends.playerFriends('chris', 'lena')).lastSeen).toBe('older')
    })

    it('hides it while Invisible, online, never seen or set to Nobody', async () => {
      await befriend('chris', 'lena')
      await seen('lena', 3 * H)
      await db.updateTable('user').set({ invisible: true }).where('id', '=', 'lena').execute()
      expect(await lastSeenOf('chris', 'lena')).toBeUndefined()
      expect((await friends.playerFriends('chris', 'lena')).lastSeen).toBeUndefined()
      await db.updateTable('user').set({ invisible: false, show_last_online: 'nobody' }).where('id', '=', 'lena').execute()
      expect(await lastSeenOf('chris', 'lena')).toBeUndefined()
      expect((await friends.playerFriends('chris', 'lena')).lastSeen).toBeUndefined()
      await db.updateTable('user').set({ show_last_online: 'friends', last_seen_at: null }).where('id', '=', 'lena').execute()
      expect(await lastSeenOf('chris', 'lena')).toBeUndefined()
      await seen('lena', 3 * H)
      friends.connected('lena')
      expect(await lastSeenOf('chris', 'lena')).toBeUndefined()
    })

    it('records when the last socket closes after the grace, at most every few minutes', async () => {
      friends.connected('lena')
      friends.disconnected('lena')
      await new Promise(r => setTimeout(r, 60))
      await friends.flush()
      const first = (await db.selectFrom('user').select('last_seen_at').where('id', '=', 'lena').executeTakeFirstOrThrow()).last_seen_at
      expect(first).toBeInstanceOf(Date)
      friends.connected('lena')
      friends.disconnected('lena')
      await new Promise(r => setTimeout(r, 60))
      await friends.flush()
      const second = (await db.selectFrom('user').select('last_seen_at').where('id', '=', 'lena').executeTakeFirstOrThrow()).last_seen_at
      expect(second).toEqual(first)
    })

    it('writes last seen for everyone online or leaving when the service closes, past the throttle', async () => {
      friends.connected('lena')
      friends.connected('max')
      friends.disconnected('max') // inside its grace
      await seen('lena', 1000) // written a moment ago: the throttle would skip it
      await friends.close()
      const at = async (id: string) =>
        (await db.selectFrom('user').select('last_seen_at').where('id', '=', id).executeTakeFirstOrThrow()).last_seen_at
      for (const id of ['lena', 'max']) expect(Date.now() - (await at(id))!.getTime()).toBeLessThan(5000)
      expect((await at('lena'))!.getTime()).toBeGreaterThan(Date.now() - 900)
      expect(await at('chris')).toBeNull()
    })

    it("lists a friend's friends with mutual ones first, to a friend", async () => {
      await befriend('chris', 'lena')
      await befriend('lena', 'max')
      await befriend('lena', 'sam')
      await befriend('chris', 'sam')
      await friends.request('chris', 'Max') // you asked them
      const p = await friends.playerFriends('chris', 'lena')
      expect(p.mutualCount).toBe(1)
      expect(p.friends?.map(f => [f.id, f.mutual, f.relation])).toEqual([
        ['sam', true, 'friend'],
        ['chris', false, 'self'],
        ['max', false, 'requested'],
      ])
      // The other way round: Max asks you, so you may answer rather than ask again
      await friends.cancel('chris', (await friends.list('chris')).outgoing[0].id)
      await friends.request('max', 'Christoph')
      expect((await friends.playerFriends('chris', 'lena')).friends?.find(f => f.id === 'max')?.relation).toBe('incoming')
    })

    it('gives a stranger the mutual count only, and a friend nothing when the list is Only me', async () => {
      await befriend('chris', 'lena')
      await befriend('lena', 'max')
      await befriend('chris', 'max')
      const stranger = await friends.playerFriends('sam', 'lena')
      expect(stranger).toEqual({ mutualCount: 0, friends: null })
      await befriend('sam', 'max')
      expect((await friends.playerFriends('sam', 'lena')).friends).toBeNull()
      expect((await friends.playerFriends('sam', 'lena')).mutualCount).toBe(1)
      await db.updateTable('user').set({ friends_visibility: 'me' }).where('id', '=', 'lena').execute()
      const friend = await friends.playerFriends('chris', 'lena')
      expect(friend.friends).toBeNull()
      expect(friend.mutualCount).toBe(1)
    })

    it('always shows you your own list, even set to Only me; a pending request is not a friend', async () => {
      await befriend('chris', 'lena')
      await friends.request('max', 'Lena')
      await db.updateTable('user').set({ friends_visibility: 'me' }).where('id', '=', 'lena').execute()
      const own = await friends.playerFriends('lena', 'lena')
      expect(own.mutualCount).toBe(0)
      expect(own.friends?.map(f => [f.id, f.relation])).toEqual([['chris', 'friend']])
      expect((await friends.playerFriends('max', 'lena')).friends).toBeNull()
    })

    it('404s for an unknown player', async () => {
      await expect(friends.playerFriends('chris', 'nobody')).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
