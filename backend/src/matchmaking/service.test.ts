import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertBoard } from '../db/queries.js'
import { getRatings } from '../db/ranked.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import { LobbyHub } from '../lobby/hub.js'
import { LobbyService } from '../lobby/service.js'
import type { MatchmakingMessage } from '../schema/lobby-ws.js'
import { ACCEPT_MS, MatchmakingService, PAUSE_MS } from './service.js'
import { DEFAULT_AVATAR_FINISH } from '../shared/avatarFinishes.js'
const defaultAvatar = { kind: 'preset' as const, foreground: DEFAULT_AVATAR_FINISH, background: DEFAULT_AVATAR_FINISH }

const user = (id: string, name: string) => ({ id, name, email: `${id}@example.com`, emailVerified: false, image: null })

describe.skipIf(!process.env.TEST_DATABASE_URL)('MatchmakingService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let engine: SessionEngine
  let lobbies: LobbyService
  let mm: MatchmakingService
  let now: number
  let sent: Map<string, MatchmakingMessage>

  const last = (userId: string): MatchmakingMessage => {
    const msg = sent.get(userId)
    if (!msg) throw new Error(`nothing sent to ${userId}`)
    return msg
  }
  const configOf = async (sessionId: string | undefined) =>
    (
      await db
        .selectFrom('game_sessions')
        .select('config')
        .where('id', '=', sessionId ?? '')
        .executeTakeFirst()
    )?.config
  const matchId = (userId: string): string => {
    const id = last(userId).match?.id
    if (id === undefined) throw new Error(`no match for ${userId}`)
    return id
  }

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('matchmaking_service_test'))
    await db
      .insertInto('user')
      .values([user('chris', 'Christoph'), user('anna', 'Anna'), user('lena', 'Lena'), user('ben', 'Ben'), user('ida', 'Ida')])
      .execute()
    await insertBoard(db, { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h-living' })
  })
  afterAll(async () => {
    await close()
  })

  beforeEach(async () => {
    await db.deleteFrom('ranked_results').execute()
    await db.deleteFrom('ranked_ratings').execute()
    await db.deleteFrom('ranked_matches').execute()
    await db.deleteFrom('game_players').execute()
    await db.deleteFrom('game_sessions').execute()
    await db.deleteFrom('lobby_activity').execute()
    await db.deleteFrom('lobby_people').execute()
    await db.deleteFrom('lobbies').execute()
    now = Date.UTC(2026, 9, 15, 20)
    sent = new Map()
    const hub = new LobbyHub()
    engine = new SessionEngine(
      createEngineStore(db),
      vi.fn(),
      () => {},
      undefined,
      e => mm.onGameEnded(e),
    )
    lobbies = new LobbyService({ db, engine, hub, isBoardOnline: () => true })
    mm = new MatchmakingService({ db, engine, send: (u, m) => sent.set(u, m), now: () => now, warn: () => {} })
  })

  it('pairs two searches near each other, and starts the game once both accept', async () => {
    await mm.search('chris', { mode: '1v1', firstTo: 3 })
    expect(last('chris').search).toMatchObject({ mode: '1v1', firstTo: 3, range: 75, rating: null, players: ['Christoph'], searching: 1 })
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    expect(last('chris').search?.searching).toBe(2)

    await mm.tick()
    const found = last('chris').match
    expect(found).toMatchObject({ mode: '1v1', firstTo: 2, range: 75, stakes: null })
    expect(found?.yours).toEqual([
      { person: { userId: 'chris', name: 'Christoph', guest: false, avatar: defaultAvatar }, accepted: false, you: true },
    ])
    // The opponent stays hidden
    expect(found?.theirs).toEqual([{ person: null, accepted: false, you: false }])
    expect(last('chris').search).toBeNull()

    await mm.accept('anna', matchId('anna'))
    expect(last('chris').match?.theirs[0].accepted).toBe(true)
    await mm.accept('chris', matchId('chris'))

    const session = engine.getSessionByUser('chris')
    expect(session?.module.id).toBe('x01')
    expect(engine.getSessionByUser('anna')).toBe(session)
    expect(await configOf(session?.id)).toMatchObject({ startScore: 501, outMode: 'double', firstTo: 2, bullOff: 'pdc', format: 'singles' })
    // Christoph plays at his own board; Anna has none, so she enters her darts by hand
    expect(session?.seats.map(s => [s.userId, s.boardId])).toEqual([
      ['chris', 'living'],
      ['anna', null],
    ])
    expect(await db.selectFrom('ranked_matches').selectAll().execute()).toEqual([
      expect.objectContaining({ session_id: session?.id, mode: '1v1', sides: [['chris'], ['anna']] }),
    ])
    expect(last('chris')).toMatchObject({ search: null, match: null })
  })

  it('pairs only within range, and the range widens while searching', async () => {
    await db.insertInto('ranked_ratings').values({ user_id: 'anna', mode: '1v1', rating: 1400, matches: 10 }).execute()
    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    await mm.tick()
    expect(last('chris').match).toBeNull()
    expect(last('anna').search?.rating).toBe(1400)
    now += 2 * 30_000 + 30_000 // ±300 after 90 s
    await mm.tick()
    expect(last('chris').match?.range).toBe(300)
    // Anna is placed: she sees what a win and a loss would do
    expect(last('anna').match?.stakes).toEqual({ win: expect.any(Number), loss: expect.any(Number) })
  })

  it('a decline drops the match: the decliner pauses, the other side keeps its place', async () => {
    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    now += 5_000
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    await mm.tick()
    const since = Date.UTC(2026, 9, 15, 20)
    await mm.decline('anna', matchId('anna'))
    expect(last('anna')).toMatchObject({ search: null, match: null, pausedUntil: new Date(now + PAUSE_MS).toISOString() })
    expect(last('chris').search?.since).toBe(new Date(since).toISOString())
    await expect(mm.search('anna', { mode: '1v1', firstTo: 2 })).rejects.toMatchObject({ statusCode: 409, body: { code: 'paused' } })
    now += PAUSE_MS
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    expect(last('anna').pausedUntil).toBeNull()
  })

  it("letting the time run out counts as declining for whoever didn't accept", async () => {
    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    await mm.tick()
    await mm.accept('chris', matchId('chris'))
    now += ACCEPT_MS
    await mm.tick()
    expect(last('chris').search).not.toBeNull()
    expect(last('anna').pausedUntil).not.toBeNull()
    expect(engine.getSessionByUser('chris')).toBeUndefined()
  })

  it("refuses a second search, and a search while you're in a game", async () => {
    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    await expect(mm.search('chris', { mode: '2v2', firstTo: 2 })).rejects.toMatchObject({ body: { code: 'searching' } })
    await engine.createWithSeats({
      ownerUserId: 'ben',
      gameId: 'x01',
      config: { startScore: 501 },
      seats: [{ name: 'Ben', userId: 'ben', controllerUserId: 'ben', boardId: null, boardName: null, bot: null }],
    })
    await expect(mm.search('ben', { mode: '1v1', firstTo: 2 })).rejects.toMatchObject({ body: { code: 'active_session' } })
  })

  it('a duo searches from a lobby of two; only its host cancels', async () => {
    await expect(mm.search('chris', { mode: '2v2', firstTo: 2 })).rejects.toMatchObject({ body: { code: 'not_duo' } })
    const { id, code } = await lobbies.create('chris')
    await lobbies.join('lena', id, code)
    await expect(mm.search('lena', { mode: '2v2', firstTo: 2 })).rejects.toMatchObject({ body: { code: 'not_duo' } })
    await mm.search('chris', { mode: '2v2', firstTo: 2 })
    expect(last('lena').search).toMatchObject({ mode: '2v2', hostUserId: 'chris', players: ['Christoph', 'Lena'] })
    await expect(mm.cancel('lena')).rejects.toMatchObject({ statusCode: 403 })
    await mm.cancel('chris')
    expect(last('lena').search).toBeNull()
  })

  it('a 2v2 match needs all four to accept and plays in teams', async () => {
    const duo = async (host: string, partner: string) => {
      const { id, code } = await lobbies.create(host)
      await lobbies.join(partner, id, code)
      await mm.search(host, { mode: '2v2', firstTo: 2 })
    }
    await duo('chris', 'lena')
    await duo('anna', 'ben')
    await mm.tick()
    expect(last('lena').match?.yours.map(s => s.person?.name)).toEqual(['Christoph', 'Lena'])
    for (const u of ['chris', 'lena', 'anna']) await mm.accept(u, matchId(u))
    expect(engine.getSessionByUser('chris')).toBeUndefined()
    expect(last('chris').match?.theirs.map(s => s.accepted)).toEqual([true, false])
    await mm.accept('ben', matchId('ben'))
    const session = engine.getSessionByUser('ben')
    expect(await configOf(session?.id)).toMatchObject({ format: 'teams', teams: [0, 0, 1, 1] })
    expect(session?.seats.map(s => s.userId)).toEqual(['chris', 'lena', 'anna', 'ben'])
  })

  it('a finished ranked game moves the ratings; an aborted one does not', async () => {
    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    await mm.tick()
    await mm.accept('chris', matchId('chris'))
    await mm.accept('anna', matchId('anna'))
    const sessionId = engine.getSessionByUser('chris')?.id ?? ''
    // Christoph forfeits: Anna wins
    await engine.onUserAction(sessionId, 'chris', { type: 'forfeit' })
    expect(engine.getSessionByUser('anna')).toBeUndefined()
    const ratings = { chris: await getRatings(db, 'chris'), anna: await getRatings(db, 'anna') }
    expect(ratings.chris['1v1']).toMatchObject({ matches: 1, wins: 0 })
    expect(ratings.anna['1v1']).toMatchObject({ matches: 1, wins: 1 })

    await mm.search('chris', { mode: '1v1', firstTo: 2 })
    await mm.search('anna', { mode: '1v1', firstTo: 2 })
    await mm.tick()
    await mm.accept('chris', matchId('chris'))
    await mm.accept('anna', matchId('anna'))
    await engine.deleteSession(engine.getSessionByUser('chris')?.id ?? '', 'chris')
    expect((await getRatings(db, 'anna'))['1v1'].matches).toBe(1)
  })
})
