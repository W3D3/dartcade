import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb } from './index.js'
import {
  runMigrations,
  insertGameSession,
  getActiveGameSessions,
  getGameSessionById,
  getSeats,
  appendSessionEvent,
  getSessionEvents,
  insertGameDarts,
  finishGameSession,
  abortGameSession,
  hasActiveSessionOnBoard,
  insertBridgeEvent,
  insertPairingCode,
  getPairingCode,
  claimPairingCode,
  consumePairingToken,
  insertBoard,
  deleteBoard,
} from './queries.js'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/dartcade_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('DB integration', () => {
  let db: Kysely<Database>

  beforeAll(async () => {
    db = createDb(url)
    await runMigrations(db)
    await db.deleteFrom('game_darts').execute()
    await db.deleteFrom('game_session_events').execute()
    await db.deleteFrom('game_players').execute()
    await db.deleteFrom('game_sessions').execute()
    await db.deleteFrom('bridge_events').execute()
    await db.deleteFrom('pairing_codes').execute()
    await db.deleteFrom('boards').execute()
    // seed minimal user rows for FK
    await db.deleteFrom('user').execute()
    await db.insertInto('user').values([
      { id: 'u-test-1', name: 'Test', email: 'test@example.com', emailVerified: false, image: null },
      { id: 'u-test-2', name: 'Test 2', email: 'test2@example.com', emailVerified: false, image: null },
    ]).execute()
  })

  afterAll(async () => {
    await db.destroy()
  })

  describe('insertGameSession / getActiveGameSessions', () => {
    it('roundtrips a session', async () => {
      await insertBoard(db, {
        id: 'board-db-1',
        owner_user_id: 'u-test-1',
        name: 'Test Board',
        token_hash: 'hash-1',
      })
      await insertGameSession(db, {
        id: '01JTEST00000000000000000AA',
        owner_user_id: 'u-test-1',
        board_db_id: 'board-db-1',
        game_id: 'atc',
        game_version: 1,
        rng_seed: 0,
        config: { throwAgainOnAllHit: false },
        players: [{ name: 'Alice', user_id: 'u-test-1' }, { name: 'Bob', user_id: null }],
      })
      const rows = await getActiveGameSessions(db)
      expect(rows).toHaveLength(1)
      expect(rows[0].board_db_id).toBe('board-db-1')
      expect(rows[0].game_id).toBe('atc')
    })

    it('getGameSessionById finds the session', async () => {
      const row = await getGameSessionById(db, '01JTEST00000000000000000AA')
      expect(row).toBeDefined()
      expect(row!.id).toBe('01JTEST00000000000000000AA')
    })

    it('abortGameSession removes from active', async () => {
      await abortGameSession(db, '01JTEST00000000000000000AA', new Date())
      const rows = await getActiveGameSessions(db)
      expect(rows).toHaveLength(0)
    })
  })

  describe('insertBridgeEvent', () => {
    it('inserts and returns inserted=true', async () => {
      const ev = {
        bridge_id: 'bridge-1', boot_id: 'boot-1', seq: BigInt(1),
        board_id: 'board-hw-1', recv_wall: new Date(),
        kind: 'dart.detected', data: { index: 0 },
      }
      const r1 = await insertBridgeEvent(db, ev)
      expect(r1).toEqual({ inserted: true, id: expect.any(String) })
    })

    it('duplicate returns inserted=false', async () => {
      const ev = {
        bridge_id: 'bridge-1', boot_id: 'boot-1', seq: BigInt(1),
        board_id: 'board-hw-1', recv_wall: new Date(),
        kind: 'dart.detected', data: { index: 0 },
      }
      const r2 = await insertBridgeEvent(db, ev)
      expect(r2).toEqual({ inserted: false, id: null })
    })
  })

  describe('game history store', () => {
    const newGame = (id: string, board: string | null = null) => insertGameSession(db, {
      id, owner_user_id: 'u-test-1', board_db_id: board, game_id: 'x01', game_version: 1, rng_seed: 7,
      config: { startScore: 301 }, players: [{ name: 'Test', user_id: 'u-test-1' }, { name: 'Guest', user_id: null }],
    })

    it('stores seats and reads active games with them', async () => {
      await newGame('g-active')
      const active = (await getActiveGameSessions(db)).find(s => s.id === 'g-active')
      expect(active).toMatchObject({ rng_seed: 7, game_version: 1, players: [{ name: 'Test', user_id: 'u-test-1' }, { name: 'Guest', user_id: null }] })
      // game_sessions_one_active_per_owner (migration 005) allows only one active session per
      // owner; close this one out so later tests can create another for 'u-test-1'.
      await abortGameSession(db, 'g-active', new Date())
    })

    it('appends and reads the input log in order', async () => {
      await newGame('g-log')
      const at = new Date('2026-10-01T10:00:00.123Z')
      await appendSessionEvent(db, { session_id: 'g-log', seq: 1, source: 'user', kind: 'takeout', data: { type: 'takeout' }, bridge_event_id: null, created_at: at })
      await appendSessionEvent(db, { session_id: 'g-log', seq: 0, source: 'board', kind: 'visit.opened', data: { visit_id: 'v1' }, bridge_event_id: null, created_at: at })
      const events = await getSessionEvents(db, 'g-log')
      expect(events.map(e => [e.seq, e.kind])).toEqual([[0, 'visit.opened'], [1, 'takeout']])
      expect(events[1].data).toEqual({ type: 'takeout' })
      expect(events[0].created_at.toISOString()).toBe('2026-10-01T10:00:00.123Z')
      await abortGameSession(db, 'g-log', new Date())
    })

    it('inserts darts once', async () => {
      await newGame('g-darts')
      const row = { session_id: 'g-darts', visit: 0, dart_index: 0, seat: 0, leg: 0, phase: 'game' as const, segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, coords: null, source: 'camera' as const, corrected: false, thrown_at: new Date() }
      await insertGameDarts(db, [row])
      await insertGameDarts(db, [row])
      const n = await db.selectFrom('game_darts').select(db.fn.countAll<string>().as('n')).where('session_id', '=', 'g-darts').executeTakeFirstOrThrow()
      expect(Number(n.n)).toBe(1)
      await abortGameSession(db, 'g-darts', new Date())
    })

    it('inserts more rows than fit in one statement (chunked)', async () => {
      await newGame('g-darts-many')
      const rowCount = 2500 // several chunks at the 1000-row chunk size
      const rows = Array.from({ length: rowCount }, (_, visit) => ({
        session_id: 'g-darts-many', visit, dart_index: 0, seat: 0, leg: 0, phase: 'game' as const,
        segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, coords: null,
        source: 'camera' as const, corrected: false, thrown_at: new Date(),
      }))
      await insertGameDarts(db, rows)
      const n = await db.selectFrom('game_darts').select(db.fn.countAll<string>().as('n')).where('session_id', '=', 'g-darts-many').executeTakeFirstOrThrow()
      expect(Number(n.n)).toBe(rowCount)
      await abortGameSession(db, 'g-darts-many', new Date())
    })

    it('finishes with placements and stats, aborts without', async () => {
      const at = new Date('2026-10-01T11:00:00.000Z')
      // Created and finished one at a time: game_sessions_one_active_per_owner (migration 005)
      // allows only one active session per owner at a time.
      await newGame('g-fin')
      await finishGameSession(db, 'g-fin', at, [{ placement: 1, stats: { average: 60 }, throwPosition: 1 }, { placement: 2, stats: { average: 40 }, throwPosition: 0 }])
      await newGame('g-abort')
      await abortGameSession(db, 'g-abort', at)
      const fin = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-fin').executeTakeFirstOrThrow()
      expect([fin.status, fin.finished_at?.toISOString()]).toEqual(['finished', at.toISOString()])
      const seats = (await getSeats(db, ['g-fin'])).get('g-fin') ?? []
      expect(seats.map(s => [s.placement, s.stats, s.throw_position])).toEqual([[1, { average: 60 }, 1], [2, { average: 40 }, 0]])
      const ab = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-abort').executeTakeFirstOrThrow()
      expect(ab.status).toBe('aborted')
      expect(((await getSeats(db, ['g-abort'])).get('g-abort') ?? []).every(s => s.placement === null)).toBe(true)
    })

    it('deleting a board keeps its finished games; a running game blocks it', async () => {
      await insertBoard(db, { id: 'board-hist', owner_user_id: 'u-test-1', name: 'B', token_hash: 'th-hist' })
      await newGame('g-on-board', 'board-hist')
      expect(await hasActiveSessionOnBoard(db, 'board-hist')).toBe(true)
      await finishGameSession(db, 'g-on-board', new Date(), [{ placement: 1, stats: {}, throwPosition: 0 }, { placement: 2, stats: {}, throwPosition: 1 }])
      expect(await hasActiveSessionOnBoard(db, 'board-hist')).toBe(false)
      await deleteBoard(db, 'board-hist')
      const row = await db.selectFrom('game_sessions').select('board_db_id').where('id', '=', 'g-on-board').executeTakeFirstOrThrow()
      expect(row.board_db_id).toBeNull()
    })

    it('deleting the creator keeps the game and nulls their seat', async () => {
      await db.insertInto('user').values({ id: 'u-gone', name: 'Gone', email: 'gone@example.com', emailVerified: false, image: null }).execute()
      await insertGameSession(db, { id: 'g-gone', owner_user_id: 'u-gone', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 0, config: {}, players: [{ name: 'Gone', user_id: 'u-gone' }, { name: 'Other', user_id: 'u-test-2' }] })
      await db.deleteFrom('user').where('id', '=', 'u-gone').execute()
      const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-gone').executeTakeFirstOrThrow()
      expect(row.owner_user_id).toBeNull()
      const seats = (await getSeats(db, ['g-gone'])).get('g-gone') ?? []
      expect(seats.map(s => s.user_id)).toEqual([null, 'u-test-2'])
    })
  })

  describe('pairing_codes queries', () => {
    const code = 'TESTCODE'
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    it('insertPairingCode creates a pending row', async () => {
      await insertPairingCode(db, { code, expiresAt })
      const row = await getPairingCode(db, code)
      expect(row).toBeDefined()
      expect(row!.code).toBe(code)
      expect(row!.claimed_at).toBeNull()
      expect(row!.raw_token).toBeNull()
      expect(row!.board_id).toBeNull()
    })

    it('getPairingCode returns undefined for unknown code', async () => {
      const row = await getPairingCode(db, 'NOTEXIST')
      expect(row).toBeUndefined()
    })

    it('claimPairingCode sets claimed_at, raw_token, and board_id', async () => {
      await insertBoard(db, {
        id: 'board-pair-1',
        owner_user_id: 'u-test-1',
        name: 'Paired Board',
        token_hash: 'hash-pair-1',
      })
      await claimPairingCode(db, { code, rawToken: 'secret-token', boardId: 'board-pair-1' })
      const row = await getPairingCode(db, code)
      expect(row!.claimed_at).not.toBeNull()
      expect(row!.raw_token).toBe('secret-token')
      expect(row!.board_id).toBe('board-pair-1')
    })

    it('consumePairingToken returns the token once, then null, and nulls raw_token', async () => {
      const first = await consumePairingToken(db, code)
      expect(first).toBe('secret-token')
      const second = await consumePairingToken(db, code)
      expect(second).toBeNull()
      const row = await getPairingCode(db, code)
      expect(row!.raw_token).toBeNull()
      expect(row!.claimed_at).not.toBeNull()
    })
  })
})
