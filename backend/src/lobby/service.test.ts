import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertBoard } from '../db/queries.js'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { LobbyHub } from './hub.js'
import { LobbyService } from './service.js'

const makeStore = () => ({
  insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
} satisfies EngineStore)
const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
const lastMsg = (ws: { send: { mock: { calls: unknown[][] } } }) => JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))
const user = (id: string, name: string) => ({ id, name, email: `${id}@example.com`, emailVerified: false, image: null })

describe.skipIf(!process.env.TEST_DATABASE_URL)('LobbyService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let engineStore: ReturnType<typeof makeStore>
  let engine: SessionEngine
  let hub: LobbyHub
  let lobbies: LobbyService
  const online = new Set<string>()

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('lobby_service_test'))
    await db.insertInto('user').values([user('chris', 'Christoph'), user('lena', 'Lena'), user('max', 'Max'), user('sam', 'Sam')]).execute()
    await insertBoard(db, { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h-living' })
    await insertBoard(db, { id: 'lenas', owner_user_id: 'lena', name: "Lena's place", token_hash: 'h-lenas' })
    await insertBoard(db, { id: 'garage', owner_user_id: 'chris', name: 'Garage', token_hash: 'h-garage' })
  })
  afterAll(async () => { await close() })

  beforeEach(async () => {
    await db.deleteFrom('lobby_activity').execute()
    await db.deleteFrom('lobby_invites').execute()
    await db.deleteFrom('lobby_people').execute()
    await db.deleteFrom('lobbies').execute()
    online.clear()
    for (const b of ['living', 'lenas', 'garage']) online.add(b)
    engineStore = makeStore()
    hub = new LobbyHub()
    engine = new SessionEngine(engineStore, vi.fn(), undefined, undefined, e => { lobbies.onGameEnded(e) })
    lobbies = new LobbyService({ db, engine, hub, isBoardOnline: b => online.has(b) })
  })

  describe('create, join, leave', () => {
    it('keeps the default name within the 48 characters a rename allows', async () => {
      await db.insertInto('user').values(user('long', 'Bartholomew Maximilian von Hohenzollern-Sigmaringen')).execute()
      const { name } = await lobbies.create('long')
      expect(name.length).toBeLessThanOrEqual(48)
      expect(name.endsWith("'s lobby")).toBe(true)
    })

    it('opens a lobby with you as host on your usual board', async () => {
      const ref = await lobbies.create('chris')
      expect(ref).toEqual({ id: expect.any(String), name: "Christoph's lobby", code: expect.stringMatching(/^[A-Z2-9]{6}$/) })
      const lobby = await lobbies.view(ref.id)
      expect(lobby?.hostUserId).toBe('chris')
      expect(lobby?.people).toMatchObject([{ userId: 'chris', name: 'Christoph', boardId: 'living', ready: false, plays: true }])
      expect(lobby?.activity.map(a => a.kind)).toEqual(['opened'])
      expect(await lobbies.current('chris')).toEqual(ref)
    })

    it('refuses a second lobby, even when two creates race', async () => {
      const results = await Promise.allSettled([lobbies.create('chris'), lobbies.create('chris')])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const failed = results.find(r => r.status === 'rejected')
      expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ statusCode: 409, body: { code: 'in_lobby' } })
      expect(await db.selectFrom('lobbies').select('id').where('closed_at', 'is', null).execute()).toHaveLength(1)
    })

    it('joins by code as people type it, on the joiner\'s usual board; Manual without boards', async () => {
      const { id, code } = await lobbies.create('chris')
      expect(await lobbies.join('lena', id, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`)).toMatchObject({ id })
      await lobbies.join('max', id, code)
      await lobbies.join('max', id, code)   // twice is fine
      const lobby = await lobbies.view(id)
      expect(lobby?.people.map(p => [p.name, p.boardName, p.ready])).toEqual([
        ['Christoph', 'Living room', false], ['Lena', "Lena's place", false], ['Max', null, false],
      ])
      expect(lobby?.activity.map(a => a.kind)).toEqual(['joined', 'joined', 'opened'])
    })

    it('refuses a wrong code, a joiner who is in another lobby, and a closed lobby', async () => {
      const a = await lobbies.create('chris')
      const b = await lobbies.create('lena')
      await expect(lobbies.join('max', a.id, a.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ')).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.join('lena', a.id, a.code)).rejects.toMatchObject({ statusCode: 409, body: { code: 'in_lobby', lobbyId: b.id } })
      await lobbies.close('chris', a.id)
      await expect(lobbies.join('max', a.id, a.code)).rejects.toMatchObject({ statusCode: 404 })
      expect(await lobbies.preview(a.code)).toBeNull()
    })

    it('previews a lobby for the join page', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      expect(await lobbies.preview(code.toLowerCase())).toEqual({
        id, name: "Christoph's lobby", hostName: 'Christoph', peopleCount: 2, boardNames: ['Living room', "Lena's place"],
      })
    })

    it('hands the host role to the member who has been there longest when the host leaves', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await lobbies.join('max', id, code)
      await lobbies.leave('chris', id)
      const lobby = await lobbies.view(id)
      expect(lobby?.hostUserId).toBe('lena')
      expect(lobby?.activity.map(a => [a.kind, a.data.name])).toEqual([
        ['host_changed', 'Lena'], ['left', 'Christoph'], ['joined', 'Max'], ['joined', 'Lena'], ['opened', 'Christoph'],
      ])
      expect(await lobbies.current('chris')).toBeNull()
      await expect(lobbies.leave('chris', id)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('closes when the last member leaves', async () => {
      const { id } = await lobbies.create('chris')
      await lobbies.leave('chris', id)
      const row = await db.selectFrom('lobbies').select('closed_at').where('id', '=', id).executeTakeFirstOrThrow()
      expect(row.closed_at).toBeInstanceOf(Date)
      expect(await lobbies.view(id)).toBeNull()
    })

    it('the host closes the lobby: people and feed go, open sockets are told and closed', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      const ws = sock()
      hub.addLobbySocket(id, ws, 'lena')
      await expect(lobbies.close('lena', id)).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.close('chris', id)
      expect(lastMsg(ws)).toEqual({ type: 'lobby_closed', lobbyId: id })
      expect(ws.close).toHaveBeenCalledWith(4404, 'lobby closed')
      expect(await db.selectFrom('lobby_people').selectAll().where('lobby_id', '=', id).execute()).toEqual([])
      expect(await lobbies.current('lena')).toBeNull()
    })

    it('a host whose account is gone hands over on the next change', async () => {
      const { id, code } = await lobbies.create('sam')
      await lobbies.join('lena', id, code)
      await db.deleteFrom('user').where('id', '=', 'sam').execute()
      await lobbies.update('lena', id, { name: 'Ours now' })
      expect(await lobbies.view(id)).toMatchObject({ hostUserId: 'lena', name: 'Ours now' })
      await db.insertInto('user').values(user('sam', 'Sam')).execute()
    })
  })

  describe('settings', () => {
    it('the host renames, sets the throw order and next game, and regenerates the code', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.update('chris', id, { name: ' Friday darts ', throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } }, regenerateCode: true })
      const lobby = await lobbies.view(id)
      expect(lobby).toMatchObject({ name: 'Friday darts', throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } } })
      expect(lobby?.code).not.toBe(code)
      expect(await lobbies.preview(code)).toBeNull()
      expect(await lobbies.preview(lobby?.code ?? '')).toMatchObject({ id })
    })

    it('refuses members, an empty name and unknown games', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await expect(lobbies.update('lena', id, { throwOrder: 'random' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.update('chris', id, { name: '  ' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(lobbies.update('chris', id, { nextGame: { gameId: 'nope', config: {} } })).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('pushes', () => {
    it('pushes every change to the lobby sockets, with presence', async () => {
      const { id, code } = await lobbies.create('chris')
      const ws = sock()
      hub.addLobbySocket(id, ws, 'chris')
      await lobbies.refreshPresence(id)
      expect(lastMsg(ws).lobby.people[0].presence).toBe('online')
      await lobbies.join('lena', id, code)
      expect(lastMsg(ws).lobby.people.map((p: { presence: string }) => p.presence)).toEqual(['online', 'away'])
    })

    it('pushes /ws/me to members, only when it changed', async () => {
      const me = sock()
      hub.addMeSocket('lena', me, await lobbies.meMessage('lena'))
      expect(lastMsg(me)).toEqual({ type: 'me', invites: [], lobby: null })
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      expect(lastMsg(me).lobby).toMatchObject({ id, name: "Christoph's lobby", peopleCount: 2, sessionId: null, youThrowNext: false })
      const sent = me.send.mock.calls.length
      await lobbies.pushMe('lena')
      expect(me.send.mock.calls.length).toBe(sent)
      await lobbies.leave('lena', id)
      expect(lastMsg(me).lobby).toBeNull()
    })

    it('tells the sockets who may open a lobby', async () => {
      const { id } = await lobbies.create('chris')
      expect(await lobbies.lobbyAccess(id, 'chris')).toBe('ok')
      expect(await lobbies.lobbyAccess(id, 'lena')).toBe('forbidden')
      expect(await lobbies.lobbyAccess('nope', 'chris')).toBe('not_found')
      expect(await lobbies.isMember(id, 'chris')).toBe(true)
      expect(await lobbies.isMember(id, 'lena')).toBe(false)
    })
  })

  describe('people', () => {
    let id: string
    const person = async (name: string) => {
      const p = (await lobbies.view(id))?.people.find(x => x.name === name)
      if (!p) throw new Error(`${name} is not in the lobby`)
      return p
    }

    beforeEach(async () => {
      const lobby = await lobbies.create('chris')
      id = lobby.id
      await lobbies.join('lena', id, lobby.code)
      await lobbies.join('max', id, lobby.code)
    })

    it('adds a guest at the adder\'s board, ready to play', async () => {
      const { id: guestId } = await lobbies.addGuest('lena', id, { name: '  Guest 1 ' })
      expect(await person('Guest 1')).toMatchObject({ id: guestId, userId: null, addedByUserId: 'lena', boardId: 'lenas', ready: true, plays: true })
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({ kind: 'guest_added', actorUserId: 'lena', data: { name: 'Guest 1' } })
    })

    it('puts a guest on Manual or on one of the adder\'s own boards only', async () => {
      await lobbies.addGuest('chris', id, { name: 'Pia', boardId: null })
      await lobbies.addGuest('chris', id, { name: 'Tom', boardId: 'garage' })
      expect(await person('Pia')).toMatchObject({ boardId: null })
      expect(await person('Tom')).toMatchObject({ boardId: 'garage', boardMovedBy: null })
      await expect(lobbies.addGuest('chris', id, { name: 'Ann', boardId: 'lenas' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.addGuest('chris', id, { name: ' ' })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('anyone gives a person on Manual one of their own boards, marked as moved', async () => {
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { boardId: 'garage' })
      expect(await person('Max')).toMatchObject({ boardId: 'garage', boardName: 'Garage', boardMovedBy: 'chris' })
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({
        kind: 'board_moved', actorUserId: 'chris', data: { name: 'Max', fromBoardName: null, toBoardName: 'Garage' },
      })
    })

    it('after that only the person, or the board\'s owner taking it back', async () => {
      const max = await person('Max')
      await lobbies.updatePerson('chris', id, max.id, { boardId: 'garage' })
      await expect(lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.updatePerson('lena', id, max.id, { boardId: null })).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.updatePerson('chris', id, max.id, { boardId: null })
      expect(await person('Max')).toMatchObject({ boardId: null, boardMovedBy: null })
      // On Manual again: anyone may give theirs
      await lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })
      expect(await person('Max')).toMatchObject({ boardId: 'lenas', boardMovedBy: 'lena' })
      await lobbies.updatePerson('max', id, max.id, { boardId: null })
      expect(await person('Max')).toMatchObject({ boardId: null })
    })

    it('the host has no extra board rights', async () => {
      await expect(lobbies.updatePerson('chris', id, (await person('Lena')).id, { boardId: 'living' })).rejects.toMatchObject({ statusCode: 403 })
    })

    it('refuses a board that is in another game', async () => {
      await engine.create('chris', 'garage', 'atc', {}, [{ name: 'Christoph' }])
      await expect(lobbies.updatePerson('chris', id, (await person('Max')).id, { boardId: 'garage' }))
        .rejects.toMatchObject({ statusCode: 409, body: { code: 'board_busy' } })
    })

    it('ready: only the person, not even the host; plays: the person or the host', async () => {
      const lena = await person('Lena')
      await expect(lobbies.updatePerson('chris', id, lena.id, { ready: true })).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.updatePerson('lena', id, lena.id, { ready: true })
      await lobbies.updatePerson('chris', id, lena.id, { plays: false })
      await expect(lobbies.updatePerson('max', id, lena.id, { plays: true })).rejects.toMatchObject({ statusCode: 403 })
      expect(await person('Lena')).toMatchObject({ ready: true, plays: false })
    })

    it('writes nothing when one field of a change is refused', async () => {
      const lena = await person('Lena')
      await expect(lobbies.updatePerson('lena', id, lena.id, { ready: true, position: 0 })).rejects.toMatchObject({ statusCode: 403 })
      expect(await person('Lena')).toMatchObject({ ready: false })
    })

    it('the host reorders people', async () => {
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { position: 0 })
      expect((await lobbies.view(id))?.people.map(p => p.name)).toEqual(['Max', 'Christoph', 'Lena'])
    })

    it('the host removes a member with their guests; a member removes only their own guests', async () => {
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await expect(lobbies.removePerson('max', id, (await person('Guest 1')).id)).rejects.toMatchObject({ statusCode: 403 })
      const lenaWs = sock()
      hub.addLobbySocket(id, lenaWs, 'lena')
      await lobbies.removePerson('chris', id, (await person('Lena')).id)
      expect((await lobbies.view(id))?.people.map(p => p.name)).toEqual(['Christoph', 'Max'])
      expect(lenaWs.close).toHaveBeenCalledWith(4403, 'removed from the lobby')
      await lobbies.addGuest('max', id, { name: 'Pia' })
      await lobbies.removePerson('max', id, (await person('Pia')).id)
      expect((await lobbies.view(id))?.activity.slice(0, 1)).toMatchObject([{ kind: 'removed', actorUserId: 'max', data: { name: 'Pia' } }])
    })

    it('a member who leaves takes their boards along: people on them go to Manual', async () => {
      const max = await person('Max')
      await lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })
      await lobbies.leave('lena', id)
      expect(await person('Max')).toMatchObject({ boardId: null, boardMovedBy: null })
    })
  })

  describe('invites', () => {
    it('a member invites an account; the invitee sees it live and accepts into the lobby', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      const me = sock()
      hub.addMeSocket('max', me, await lobbies.meMessage('max'))
      const { id: inviteId } = await lobbies.invite('lena', id, 'max')
      expect(lastMsg(me).invites).toEqual([
        { id: inviteId, lobbyId: id, lobbyName: "Christoph's lobby", inviterUserId: 'lena', inviterName: 'Lena', createdAt: expect.any(String) },
      ])
      expect((await lobbies.view(id))?.invites).toMatchObject([{ userId: 'max', name: 'Max', invitedByUserId: 'lena' }])
      expect(await lobbies.listInvites('max')).toHaveLength(1)

      expect(await lobbies.acceptInvite('max', inviteId)).toMatchObject({ id })
      const lobby = await lobbies.view(id)
      expect(lobby?.invites).toEqual([])
      expect(lobby?.people.map(p => p.name)).toEqual(['Christoph', 'Lena', 'Max'])
      expect(lastMsg(me)).toMatchObject({ invites: [], lobby: { id } })
    })

    it('refuses inviting yourself, a member, someone invited already, or an unknown account', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await lobbies.invite('chris', id, 'max')
      await expect(lobbies.invite('chris', id, 'chris')).rejects.toMatchObject({ statusCode: 400 })
      await expect(lobbies.invite('chris', id, 'lena')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_member' } })
      await expect(lobbies.invite('lena', id, 'max')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_invited' } })
      await expect(lobbies.invite('chris', id, 'nobody')).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.invite('sam', id, 'max')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('declines; only the invitee answers', async () => {
      const { id } = await lobbies.create('chris')
      const { id: inviteId } = await lobbies.invite('chris', id, 'max')
      await expect(lobbies.declineInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.acceptInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 404 })
      await lobbies.declineInvite('max', inviteId)
      expect(await lobbies.listInvites('max')).toEqual([])
      expect((await lobbies.view(id))?.invites).toEqual([])
      await expect(lobbies.acceptInvite('max', inviteId)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('accepting while in another lobby asks to leave it first, and the invite stays', async () => {
      const { id } = await lobbies.create('chris')
      const { id: inviteId } = await lobbies.invite('chris', id, 'lena')
      const own = await lobbies.create('lena')
      await expect(lobbies.acceptInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 409, body: { code: 'in_lobby', lobbyId: own.id } })
      expect(await lobbies.listInvites('lena')).toHaveLength(1)
    })

    it('a closed lobby\'s invites expire; joining by code accepts a pending invite', async () => {
      const a = await lobbies.create('chris')
      const { id: expiring } = await lobbies.invite('chris', a.id, 'max')
      await lobbies.close('chris', a.id)
      expect(await lobbies.listInvites('max')).toEqual([])
      await expect(lobbies.acceptInvite('max', expiring)).rejects.toMatchObject({ statusCode: 404 })

      const b = await lobbies.create('lena')
      await lobbies.invite('lena', b.id, 'max')
      await lobbies.join('max', b.id, b.code)
      expect(await lobbies.listInvites('max')).toEqual([])
    })
  })

  describe('games', () => {
    let id: string
    let code: string
    const person = async (name: string) => {
      const p = (await lobbies.view(id))?.people.find(x => x.name === name)
      if (!p) throw new Error(`${name} is not in the lobby`)
      return p
    }
    const setReady = async (userId: string, name: string) => { await lobbies.updatePerson(userId, id, (await person(name)).id, { ready: true }) }

    beforeEach(async () => {
      ({ id, code } = await lobbies.create('chris'))
      await lobbies.join('lena', id, code)
      await lobbies.update('chris', id, { nextGame: { gameId: 'x01', config: { startScore: 101 } } })
    })

    it('asks the host to confirm when people aren\'t ready, then starts with the roster as seats', async () => {
      await setReady('chris', 'Christoph')
      await expect(lobbies.start('chris', id, false)).rejects.toMatchObject({
        statusCode: 409, body: { code: 'not_ready', notReady: [{ name: 'Lena' }] },
      })
      const { sessionId } = await lobbies.start('chris', id, true)
      const session = engine.getSession(sessionId)
      expect(session).toMatchObject({ ownerUserId: 'chris', lobbyId: id, lobbyName: "Christoph's lobby", boardId: null })
      expect(session?.seats).toEqual([
        { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: 'living', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena', controllerUserId: 'lena', boardId: 'lenas', boardName: "Lena's place" },
      ])
      expect(engineStore.insertSession).toHaveBeenCalledWith(expect.objectContaining({ lobby_id: id, config: expect.objectContaining({ startScore: 101, bullOff: 'off' }) }))
      expect((await lobbies.view(id))?.currentSessionId).toBe(sessionId)
    })

    it('seats a guest with their adder as controller, and leaves out who sits out', async () => {
      await lobbies.join('max', id, code)
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      const { sessionId } = await lobbies.start('chris', id, true)
      expect(engine.getSession(sessionId)?.seats.map(s => [s.name, s.controllerUserId, s.boardId])).toEqual([
        ['Christoph', 'chris', 'living'], ['Lena', 'lena', 'lenas'], ['Guest 1', 'lena', 'lenas'],
      ])
    })

    it('refuses members, no game set, offline boards, a second start, and closing during a game', async () => {
      await expect(lobbies.start('lena', id, true)).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.update('chris', id, { nextGame: null })
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 400 })
      await lobbies.update('chris', id, { nextGame: { gameId: 'x01', config: {} } })
      online.delete('lenas')
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 409, body: { code: 'board_offline', offlineBoards: ["Lena's place"] } })
      online.add('lenas')
      const { sessionId } = await lobbies.start('chris', id, true)
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 409, body: { code: 'game_running', sessionId } })
      await expect(lobbies.close('chris', id)).rejects.toMatchObject({ statusCode: 409, body: { code: 'game_running' } })
    })

    it('one game per person: someone already in a game blocks the start, by name', async () => {
      await engine.create('lena', null, 'atc', {}, [{ name: 'Lena' }])
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({
        statusCode: 409, body: { code: 'active_session', error: 'Lena already has a game running' },
      })
    })

    it('after the game: everyone back in, members not ready, guests ready, a game_played line', async () => {
      await lobbies.join('max', id, code)
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      await setReady('chris', 'Christoph')
      await lobbies.updatePerson('lena', id, (await person('Guest 1')).id, { ready: false })
      const { sessionId } = await lobbies.start('chris', id, true)
      // Lena gives up her seat and her guest's: Christoph wins
      await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
      await lobbies.whenIdle(id)
      const lobby = await lobbies.view(id)
      expect(lobby?.currentSessionId).toBeNull()
      expect(lobby?.people.map(p => [p.name, p.plays, p.ready])).toEqual([
        ['Christoph', true, false], ['Lena', true, false], ['Max', true, false], ['Guest 1', true, true],
      ])
      expect(lobby?.activity[0]).toMatchObject({
        kind: 'game_played', actorUserId: null,
        data: {
          sessionId, gameId: 'x01', winnerName: 'Christoph',
          players: [{ name: 'Christoph', placement: 1, forfeited: false }, { name: 'Lena', forfeited: true }, { name: 'Guest 1', forfeited: true }],
        },
      })
    })

    it('an abort resets the lobby too and names who aborted', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({ kind: 'game_aborted', actorUserId: 'chris', data: { sessionId, gameId: 'x01' } })
    })

    it('rematch: the same players and settings, the same soft gate, also after an abort', async () => {
      await expect(lobbies.rematch('chris', id, true)).rejects.toMatchObject({ statusCode: 400 })
      await lobbies.join('max', id, code)
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      const first = await lobbies.start('chris', id, true)
      await engine.deleteSession(first.sessionId, 'chris')
      await lobbies.whenIdle(id)
      // The host changes the next game meanwhile: a rematch still repeats the last one
      await lobbies.update('chris', id, { nextGame: { gameId: 'atc', config: {} } })
      await expect(lobbies.rematch('chris', id, false)).rejects.toMatchObject({ body: { code: 'not_ready' } })
      const { sessionId } = await lobbies.rematch('chris', id, true)
      const session = engine.getSession(sessionId)
      expect(session?.module.id).toBe('x01')
      expect(session?.seats.map(s => s.name)).toEqual(['Christoph', 'Lena'])
      expect(engineStore.insertSession).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ startScore: 101 }) }))
      expect((await person('Max')).plays).toBe(false)
    })

    it('throw order: a bull off turns the game\'s bull off on', async () => {
      await lobbies.update('chris', id, { throwOrder: 'bulloff' })
      await lobbies.start('chris', id, true)
      expect(engineStore.insertSession).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ bullOff: 'wdc' }) }))
    })

    it('a host who leaves mid-game stays host (and can abort) until the game ends; then the role passes on', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      expect((await lobbies.view(id))?.hostUserId).toBe('chris')
      expect(engine.getSession(sessionId)?.status).toBe('active')
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect((await lobbies.view(id))?.hostUserId).toBe('lena')
    })

    it('a host who left recovers on the next change even if the game-end hook was lost (server died)', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      // The game ends but the lobby never hears of it, as when the server dies right then
      const hook = vi.spyOn(lobbies, 'onGameEnded').mockImplementation(() => undefined)
      await engine.deleteSession(sessionId, 'chris')
      hook.mockRestore()
      expect((await lobbies.view(id))?.hostUserId).toBe('chris')
      // Lena changes something: the role passes on first, so the host-only change works
      await lobbies.update('lena', id, { name: 'Lena\'s lobby' })
      expect(await lobbies.view(id)).toMatchObject({ hostUserId: 'lena', name: 'Lena\'s lobby' })
    })

    it('at start-up, a lobby everyone left during a game closes even if the game-end hook was lost', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      await lobbies.leave('lena', id)
      const hook = vi.spyOn(lobbies, 'onGameEnded').mockImplementation(() => undefined)
      await engine.deleteSession(sessionId, 'chris')
      hook.mockRestore()
      expect(await lobbies.view(id)).not.toBeNull()
      await lobbies.settleAll()
      expect(await lobbies.view(id)).toBeNull()
    })

    it('a lobby everyone left during a game closes when the game ends', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      await lobbies.leave('lena', id)
      expect((await lobbies.view(id))?.people).toEqual([])
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect(await lobbies.view(id)).toBeNull()
      const row = await db.selectFrom('lobbies').select('closed_at').where('id', '=', id).executeTakeFirstOrThrow()
      expect(row.closed_at).toBeInstanceOf(Date)
    })
  })
})
