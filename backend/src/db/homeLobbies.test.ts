import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { insertGameSession } from './queries.js'
import { acceptFriendRequest, insertFriendRequest } from './friends.js'
import { insertLobby, insertPerson } from './lobbies.js'
import { homeLobbies } from './homeLobbies.js'
import { openTestSchema } from './testSchema.js'
import type { Database } from './schema.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('home lobbies', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  // New lobbies are invite-only; friends can join only once the host opens them to friends
  async function lobby(id: string, hostId: string, code: string, access: 'friends' | 'invite' = 'friends') {
    await insertLobby(
      db,
      { id, name: `${hostId}'s lobby`, hostUserId: hostId, code },
      { id: `${id}-host`, userId: hostId, addedByUserId: hostId, name: hostId, boardId: null, ready: false },
    )
    await db.updateTable('lobbies').set({ access }).where('id', '=', id).execute()
  }
  const guest = (lobbyId: string, n: number, boardId: string | null) =>
    insertPerson(db, { id: `${lobbyId}-g${n}`, lobbyId, userId: null, addedByUserId: 'ann', name: `Guest ${n}`, boardId, ready: false })

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('home_lobbies_test'))
    const users = ['ann', 'bob', 'dan', 'eve', 'fay', 'gus']
    await db
      .insertInto('user')
      .values(users.map(id => ({ id, name: id, email: `${id}@example.com`, emailVerified: true, image: null, role: null })))
      .execute()
    await db
      .insertInto('boards')
      .values(['b1', 'b2'].map(id => ({ id, owner_user_id: 'bob', name: id, token_hash: `hash-${id}` })))
      .execute()
    // ann is friends with bob, dan, eve and gus; fay is a stranger
    for (const friend of ['bob', 'dan', 'eve', 'gus']) {
      await insertFriendRequest(db, { id: `f-${friend}`, requesterId: 'ann', addresseeId: friend })
      await acceptFriendRequest(db, `f-${friend}`, new Date())
    }
  })
  afterAll(async () => close())

  it('is empty for someone without friends', async () => {
    expect(await homeLobbies(db, 'fay')).toEqual([])
  })

  it('lists an open friends lobby with its game, people and boards', async () => {
    await lobby('lb', 'bob', 'BBBBBB')
    await db
      .updateTable('lobbies')
      .set({ next_game: JSON.stringify({ gameId: 'x01', config: { startScore: 501 } }) })
      .where('id', '=', 'lb')
      .execute()
    await guest('lb', 1, 'b1')
    await guest('lb', 2, 'b1')
    await guest('lb', 3, 'b2')
    expect(await homeLobbies(db, 'ann')).toEqual([
      { id: 'lb', name: "bob's lobby", hostName: 'bob', state: 'open', mode: 'x01', startScore: 501, people: 4, boards: 2 },
    ])
  })

  it('leaves out a lobby of a stranger, an invite-only one and a closed one', async () => {
    await lobby('ld', 'dan', 'DDDDDD', 'invite')
    await lobby('le', 'eve', 'EEEEEE')
    await db.updateTable('lobbies').set({ closed_at: new Date() }).where('id', '=', 'le').execute()
    await lobby('lf', 'fay', 'FFFFFF')
    expect((await homeLobbies(db, 'ann')).map(l => l.id)).toEqual(['lb'])
  })

  it('shows a lobby with a running game as in_game, with that game', async () => {
    await lobby('lg', 'gus', 'GGGGGG')
    await insertGameSession(db, {
      id: 'running',
      owner_user_id: 'gus',
      board_db_id: null,
      game_id: 'minigolf',
      game_version: 1,
      rng_seed: 0,
      config: {},
      players: [{ name: 'gus', user_id: 'gus', controller_user_id: 'gus', board_db_id: null, bot_level: null }],
    })
    await db.updateTable('game_sessions').set({ lobby_id: 'lg' }).where('id', '=', 'running').execute()
    const lg = (await homeLobbies(db, 'ann')).find(l => l.id === 'lg')
    expect(lg).toMatchObject({ state: 'in_game', mode: 'minigolf', startScore: null, people: 1, boards: 0 })
  })

  it('leaves out the lobby of a host who is Invisible', async () => {
    await db
      .insertInto('user')
      .values({ id: 'ivy', name: 'ivy', email: 'ivy@example.com', emailVerified: true, image: null, role: null, invisible: true })
      .execute()
    await insertFriendRequest(db, { id: 'f-ivy', requesterId: 'ann', addresseeId: 'ivy' })
    await acceptFriendRequest(db, 'f-ivy', new Date())
    await lobby('li', 'ivy', 'IIIIII')
    expect((await homeLobbies(db, 'ann')).some(l => l.id === 'li')).toBe(false)
  })

  it('does not list the viewer’s own lobby', async () => {
    await lobby('la', 'ann', 'AAAAAA')
    expect((await homeLobbies(db, 'ann')).some(l => l.id === 'la')).toBe(false)
  })
})
