import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { abortGameSession, getActiveGameSessions, insertGameSession, insertBoard } from './queries.js'
import { pgErrorCode } from './errors.js'
import {
  insertLobby, insertPerson, loadLobby, updateLobby, updatePerson, setPositions, setPlaying, resetAfterGame,
  clearBoardsOf, releaseBoard, insertInvite, getInvite, setInviteStatus, acceptInvites, pendingInvitesFor,
  closeLobbyRows, getOpenLobbyIdByCode, getOpenLobbyIdOfUser, usualBoards, addActivity, deletePeople,
} from './lobbies.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('lobby tables', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('lobbies_db_test'))
    await db.insertInto('user').values([
      { id: 'chris', name: 'Christoph', email: 'c@example.com', emailVerified: false, image: null },
      { id: 'lena', name: 'Lena', email: 'l@example.com', emailVerified: false, image: null },
      { id: 'max', name: 'Max', email: 'm@example.com', emailVerified: false, image: null },
      { id: 'sam', name: 'Sam', email: 's@example.com', emailVerified: false, image: null },
    ]).execute()
  })
  afterAll(async () => { await close() })

  describe('games from a lobby', () => {
    it('links a game to its lobby and reads the lobby name back', async () => {
      await db.insertInto('lobbies').values({ id: 'l1', name: "Christoph's lobby", host_user_id: 'chris', code: 'K7Q4MA' }).execute()
      await insertGameSession(db, {
        id: 'g1', owner_user_id: 'chris', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {}, lobby_id: 'l1',
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g1')
      expect(game).toMatchObject({ lobby_id: 'l1', lobby_name: "Christoph's lobby" })
    })

    it('reads a local game with no lobby', async () => {
      await insertGameSession(db, {
        id: 'g-local', owner_user_id: 'chris', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 1, config: {},
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g-local')
      expect(game).toMatchObject({ lobby_id: null, lobby_name: null })
    })

    it('records who aborted a game', async () => {
      await abortGameSession(db, 'g1', new Date(), 'chris')
      await abortGameSession(db, 'g-local', new Date())
      const rows = await db.selectFrom('game_sessions').select(['id', 'status', 'aborted_by_user_id']).orderBy('id').execute()
      expect(rows).toEqual([
        { id: 'g-local', status: 'aborted', aborted_by_user_id: null },
        { id: 'g1', status: 'aborted', aborted_by_user_id: 'chris' },
      ])
    })
  })

  describe('constraints', () => {
    afterAll(async () => { await db.deleteFrom('lobby_people').execute() })

    it('keeps a user in one open lobby', async () => {
      await db.insertInto('lobbies').values([
        { id: 'c1', name: 'A', host_user_id: 'sam', code: 'AAAAAA' },
        { id: 'c2', name: 'B', host_user_id: 'sam', code: 'BBBBBB' },
      ]).execute()
      const row = (id: string, lobbyId: string) => ({
        id, lobby_id: lobbyId, user_id: 'sam', added_by_user_id: 'sam', name: 'Sam', board_id: null, position: 0, board_moved_by: null,
      })
      await db.insertInto('lobby_people').values(row('p1', 'c1')).execute()
      const err = await db.insertInto('lobby_people').values(row('p2', 'c2')).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })

    it('lets a closed lobby\'s code be used again, but not an open one\'s', async () => {
      await db.updateTable('lobbies').set({ closed_at: new Date() }).where('id', '=', 'c1').execute()
      await db.insertInto('lobbies').values({ id: 'c3', name: 'C', host_user_id: 'sam', code: 'AAAAAA' }).execute()
      const err = await db.insertInto('lobbies').values({ id: 'c4', name: 'D', host_user_id: 'sam', code: 'BBBBBB' }).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })
  })

  describe('lobby queries', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 2, 18, min))

    beforeAll(async () => {
      await insertBoard(db, { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h-living' })
      await insertBoard(db, { id: 'lenas', owner_user_id: 'lena', name: "Lena's place", token_hash: 'h-lenas' })
      // Lena's latest game was on her own board; Christoph's had none (g1), so his first board counts
      await insertGameSession(db, {
        id: 'old', owner_user_id: 'lena', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {},
        players: [{ name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: 'lenas' }],
      })
      await insertLobby(db, { id: 'q1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD' },
        { id: 'host', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', ready: false, joinedAt: t(0) })
      await insertPerson(db, { id: 'lena-p', lobbyId: 'q1', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', ready: false, joinedAt: t(1) })
      await insertPerson(db, { id: 'guest', lobbyId: 'q1', userId: null, addedByUserId: 'chris', name: 'Guest 1', boardId: 'living', ready: true, joinedAt: t(2) })
    })

    it('finds the usual board: the own board of the latest game, else the first paired one', async () => {
      const usual = await usualBoards(db, ['chris', 'lena', 'max'])
      expect(usual.get('chris')).toEqual({ id: 'living', name: 'Living room' })
      expect(usual.get('lena')).toEqual({ id: 'lenas', name: "Lena's place" })
      expect(usual.has('max')).toBe(false)
    })

    it('loads a lobby with its people in order, their boards and usual boards', async () => {
      const lobby = await loadLobby(db, 'q1')
      expect(lobby).toMatchObject({
        id: 'q1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD',
        throwOrder: 'lobby', nextGame: null, closedAt: null,
      })
      expect(lobby?.people.map(p => [p.id, p.name, p.boardName, p.boardOwnerUserId, p.usualBoardName, p.plays, p.ready])).toEqual([
        ['host', 'Christoph', 'Living room', 'chris', 'Living room', true, false],
        ['lena-p', 'Lena', "Lena's place", 'lena', "Lena's place", true, false],
        ['guest', 'Guest 1', 'Living room', 'chris', null, true, true],
      ])
      expect(lobby?.activity.map(a => [a.kind, a.actorName, a.data])).toEqual([['opened', 'Christoph', { name: 'Christoph' }]])
    })

    it('lists activity newest first', async () => {
      await addActivity(db, 'q1', 'joined', 'lena', { name: 'Lena' })
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.activity.map(a => a.kind)).toEqual(['joined', 'opened'])
    })

    it('keeps the JSON settings', async () => {
      await updateLobby(db, 'q1', { throw_order: 'random', next_game: { gameId: 'x01', config: { startScore: 301 } } })
      expect(await loadLobby(db, 'q1')).toMatchObject({
        throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } },
      })
    })

    it('reorders people and sets who plays', async () => {
      await setPositions(db, 'q1', ['guest', 'host', 'lena-p'])
      await setPlaying(db, 'q1', ['guest', 'lena-p'])
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.plays])).toEqual([['guest', true], ['host', false], ['lena-p', true]])
    })

    it('resets after a game: everyone plays, members not ready, guests ready', async () => {
      await updatePerson(db, 'lena-p', { ready: true })
      await updatePerson(db, 'guest', { ready: false })
      await resetAfterGame(db, 'q1')
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.plays, p.ready])).toEqual([['guest', true, true], ['host', true, false], ['lena-p', true, false]])
    })

    it('sends people on an owner\'s boards to Manual', async () => {
      await updatePerson(db, 'guest', { board_moved_by: 'chris' })
      await clearBoardsOf(db, 'q1', 'chris')
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.boardId, p.boardMovedBy])).toEqual([['guest', null, null], ['host', null, null], ['lena-p', 'lenas', null]])
    })

    it('releases a board in every lobby', async () => {
      expect(await releaseBoard(db, 'lenas')).toEqual(['q1'])
      const lena = (await loadLobby(db, 'q1'))?.people.find(p => p.id === 'lena-p')
      expect(lena).toMatchObject({ boardId: null, boardMovedBy: null })
    })

    it('deletes people, leaving the others in order', async () => {
      await insertPerson(db, { id: 'leaver', lobbyId: 'q1', userId: null, addedByUserId: 'chris', name: 'Guest 2', boardId: null, ready: true, joinedAt: t(3) })
      await deletePeople(db, ['leaver'])
      await deletePeople(db, [])
      expect((await loadLobby(db, 'q1'))?.people.map(p => p.id)).toEqual(['guest', 'host', 'lena-p'])
    })

    it('lists pending invites of open lobbies, and expires them when the lobby closes', async () => {
      await insertInvite(db, { id: 'inv1', lobbyId: 'q1', inviteeUserId: 'max', inviterUserId: 'lena' })
      expect(await pendingInvitesFor(db, 'max')).toEqual([
        { id: 'inv1', lobbyId: 'q1', lobbyName: "Christoph's lobby", inviterUserId: 'lena', inviterName: 'Lena', createdAt: expect.any(Date) },
      ])
      expect((await loadLobby(db, 'q1'))?.invites).toEqual([
        { id: 'inv1', userId: 'max', name: 'Max', invitedByUserId: 'lena', createdAt: expect.any(Date) },
      ])
      expect(await getOpenLobbyIdByCode(db, 'K7Q4MD')).toBe('q1')
      expect(await getOpenLobbyIdOfUser(db, 'lena')).toBe('q1')

      expect(await closeLobbyRows(db, 'q1', new Date())).toEqual(['max'])
      const closed = await loadLobby(db, 'q1')
      expect(closed?.closedAt).toBeInstanceOf(Date)
      expect(closed?.people).toEqual([])
      expect(closed?.activity).toEqual([])
      expect((await getInvite(db, 'inv1'))?.status).toBe('expired')
      expect(await pendingInvitesFor(db, 'max')).toEqual([])
      expect(await getOpenLobbyIdByCode(db, 'K7Q4MD')).toBeUndefined()
      expect(await getOpenLobbyIdOfUser(db, 'lena')).toBeUndefined()
    })

    it('accepts and declines invites', async () => {
      await insertLobby(db, { id: 'q2', name: "Max's lobby", hostUserId: 'max', code: 'QQQQQQ' },
        { id: 'max-p', userId: 'max', addedByUserId: 'max', name: 'Max', boardId: null, ready: false })
      await insertInvite(db, { id: 'inv2', lobbyId: 'q2', inviteeUserId: 'lena', inviterUserId: 'max' })
      await insertInvite(db, { id: 'inv3', lobbyId: 'q2', inviteeUserId: 'chris', inviterUserId: 'max' })
      await acceptInvites(db, 'q2', 'lena')
      await setInviteStatus(db, 'inv3', 'declined')
      expect((await getInvite(db, 'inv2'))?.status).toBe('accepted')
      expect((await getInvite(db, 'inv3'))?.status).toBe('declined')
      expect((await loadLobby(db, 'q2'))?.invites).toEqual([])
    })
  })
})
