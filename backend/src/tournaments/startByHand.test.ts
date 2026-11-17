import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { setParticipants } from '../db/tournamentParticipants.js'
import { SessionEngine, createEngineStore } from '../session/engine.js'
import { currentSeat } from '../session/access.js'
import { insertBoard, insertTournament, insertUsers } from '../test/fixtures.js'
import { TournamentService, choosesFirst } from './service.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('starting an in-person match by hand', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let engine: SessionEngine
  let service: TournamentService
  const offline = new Set(['off'])
  const boards = ['b1', 'b2', 'off', 'other'].map(id => ({ id, name: `Board ${id}` }))
  const board = (id: string) => ({ id, name: `Board ${id}` })
  const matchRows = () =>
    db.selectFrom('tournament_matches').selectAll().where('tournament_id', '=', 'venue').orderBy('round').orderBy('slot').execute()

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('tournament_by_hand_test'))
    await insertUsers(db, ['org'])
    for (const id of ['b1', 'b2', 'off', 'other']) await insertBoard(db, { id, owner_user_id: 'org' })
    engine = new SessionEngine(
      createEngineStore(db),
      () => {},
      () => {},
      undefined,
      e => service.onGameEnded(e),
    )
    service = new TournamentService({
      db,
      engine,
      isOnline: () => false,
      boardOnline: id => !offline.has(id),
      send: () => {},
      warn: () => {},
    })
    await insertTournament(db, {
      id: 'venue',
      owner_user_id: 'org',
      status: 'open',
      play: 'in_person',
      preselected: true,
      game_config: JSON.stringify({ startScore: 301 }),
    })
    await setParticipants(
      db,
      'venue',
      ['Anna', 'Jonas', 'Mia', 'Paul'].map(name => ({ name, tag: null, color: null, players: [{ name }] })),
    )
    expect(await service.organizerStart('venue')).toBe('started')
  })

  afterAll(async () => {
    await close()
  })

  it('starts a ready match on a free board, with the chosen player throwing first', async () => {
    const [m1] = await matchRows()
    expect(m1.status).toBe('ready')
    const res = await service.startByHand('venue', 'R1M1', { by: 'org', boardId: 'b1', boards, first: 1 })
    if (!res.ok) throw new Error(res.error)
    const session = engine.getSession(res.sessionId)
    expect(session?.seats.map(s => s.boardId)).toEqual(['b1', 'b1'])
    expect(session?.seats.map(s => s.controllerUserId)).toEqual(['org', 'org'])
    expect(session && currentSeat(session)).toBe(1)
    expect((await matchRows())[0].status).toBe('live')
    const linked = await db.selectFrom('game_players').select('tournament_player_id').where('session_id', '=', res.sessionId).execute()
    expect(linked.every(p => p.tournament_player_id !== null)).toBe(true)
  })

  it('refuses a second start of the same match (two devices), a busy board and an offline one', async () => {
    expect(await service.startByHand('venue', 'R1M1', { by: 'org', boardId: 'b2', boards, first: 0 })).toEqual({
      ok: false,
      error: 'not_ready',
    })
    expect(await service.startByHand('venue', 'R1M2', { by: 'org', boardId: 'b1', boards, first: 0 })).toEqual({
      ok: false,
      error: 'board_busy',
    })
    expect(await service.startByHand('venue', 'R1M2', { by: 'org', boardId: 'off', boards, first: 0 })).toEqual({
      ok: false,
      error: 'board_offline',
    })
    expect((await matchRows())[1].status).toBe('ready')
  })

  it('lists boards as free, in use by a match, or offline', async () => {
    const all = ['b1', 'b2', 'off'].map(board)
    const state = (await service.playBoards('venue', all)).map(b => [b.id, b.state, b.matchKey])
    expect(state).toEqual([
      ['b1', 'in_use', 'R1M1'],
      ['b2', 'free', null],
      ['off', 'offline', null],
    ])
    // A tournament that names its boards offers only those
    const { settings } = await db.selectFrom('tournaments').select('settings').where('id', '=', 'venue').executeTakeFirstOrThrow()
    await db
      .updateTable('tournaments')
      .set({ settings: JSON.stringify({ ...settings, boardIds: ['b2'] }) })
      .where('id', '=', 'venue')
      .execute()
    expect((await service.playBoards('venue', all)).map(b => b.id)).toEqual(['b2'])
    await db
      .updateTable('tournaments')
      .set({ settings: JSON.stringify(settings) })
      .where('id', '=', 'venue')
      .execute()
  })

  it('only games with a bull off can start with a chosen player', () => {
    expect(['x01', 'cricket', 'hilo', 'p121'].map(choosesFirst)).toEqual([true, true, true, true])
    expect(['atc', 'minigolf'].map(choosesFirst)).toEqual([false, false])
  })

  it('refuses a chosen player in a game that cannot take one, and a bull off there is fine', async () => {
    await insertTournament(db, { id: 'atc', owner_user_id: 'org', status: 'open', play: 'in_person', preselected: true, game_id: 'atc' })
    await setParticipants(
      db,
      'atc',
      ['Ann', 'Bo'].map(name => ({ name, tag: null, color: null, players: [{ name }] })),
    )
    expect(await service.organizerStart('atc')).toBe('started')
    const key = 'R1M1'
    expect(await service.startByHand('atc', key, { by: 'org', boardId: null, boards, first: 1 })).toEqual({
      ok: false,
      error: 'not_startable',
    })
    const res = await service.startByHand('atc', key, { by: 'org', boardId: null, boards, first: 'bull_off' })
    expect(res.ok).toBe(true)
  })

  it('refuses a board that is not the organizer’s own', async () => {
    expect(await service.startByHand('venue', 'R1M2', { by: 'org', boardId: 'nope', boards, first: 0 })).toEqual({
      ok: false,
      error: 'not_a_board',
    })
  })

  it('plays without a board, a bull off deciding who starts', async () => {
    const res = await service.startByHand('venue', 'R1M2', { by: 'org', boardId: null, boards, first: 'bull_off' })
    if (!res.ok) throw new Error(res.error)
    const session = engine.getSession(res.sessionId)
    expect(session?.seats.map(s => s.boardId)).toEqual([null, null])
    expect((session?.currentState as { stage: string }).stage).toBe('bulloff')
  })

  it('refuses a match whose sides are not decided yet', async () => {
    const rows = await matchRows()
    const final = rows.find(r => r.round === 2)
    expect(final?.status).toBe('pending')
    expect(await service.startByHand('venue', 'R2M1', { by: 'org', boardId: null, boards, first: 0 })).toEqual({
      ok: false,
      error: 'not_ready',
    })
    expect(await service.startByHand('venue', 'nope', { by: 'org', boardId: null, boards, first: 0 })).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
