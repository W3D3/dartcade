import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb } from './index.js'
import {
  runMigrations,
  insertGameSession,
  getActiveGameSessions,
  getGameSessionById,
  setGameSessionFinished,
  insertBridgeEvent,
  getBridgeEventsForBoardDbId,
  insertBoard,
} from './queries.js'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/dartcade_test'

let db: Kysely<Database>

beforeAll(async () => {
  db = createDb(url)
  await runMigrations(db)
  await db.deleteFrom('game_sessions').execute()
  await db.deleteFrom('bridge_events').execute()
  await db.deleteFrom('boards').execute()
  // seed a minimal user row for FK
  await db.deleteFrom('user').execute()
  await db.insertInto('user').values({
    id: 'u-test-1',
    name: 'Test',
    email: 'test@example.com',
    email_verified: false,
    image: null,
  } as any).execute()
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
      board_db_id: 'board-db-1',
      game_id: 'atc',
      config: { throwAgainOnAllHit: false },
      players: [{ name: 'Alice' }, { name: 'Bob' }],
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

  it('setGameSessionFinished removes from active', async () => {
    await setGameSessionFinished(db, '01JTEST00000000000000000AA')
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
    expect(r1.inserted).toBe(true)
  })

  it('duplicate returns inserted=false', async () => {
    const ev = {
      bridge_id: 'bridge-1', boot_id: 'boot-1', seq: BigInt(1),
      board_id: 'board-hw-1', recv_wall: new Date(),
      kind: 'dart.detected', data: { index: 0 },
    }
    const r2 = await insertBridgeEvent(db, ev)
    expect(r2.inserted).toBe(false)
  })

  it('getBridgeEventsForBoardDbId returns empty when board has no hardware_id', async () => {
    const since = new Date(Date.now() - 60_000)
    const rows = await getBridgeEventsForBoardDbId(db, 'board-db-1', since)
    // board-db-1 has no hardware_id yet, so no events
    expect(rows).toHaveLength(0)
  })
})
