import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createDb } from './index.js'
import {
  runMigrations,
  insertSession,
  getActiveSessions,
  getSessionById,
  setSessionFinished,
  insertBridgeEvent,
  getBridgeEventsForBoard,
} from './queries.js'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/dartcade_test'

let db: Kysely<Database>

beforeAll(async () => {
  db = createDb(url)
  await runMigrations(db)
  await db.deleteFrom('bridge_events').execute()
  await db.deleteFrom('sessions').execute()
})

afterAll(async () => {
  await db.destroy()
})

describe('insertSession / getActiveSessions', () => {
  it('roundtrips a session', async () => {
    await insertSession(db, {
      id: '01JTEST00000000000000000AA',
      board_id: 'board-1',
      game_id: 'atc',
      config: { throwAgainOnAllHit: false },
      players: [{ name: 'Alice' }, { name: 'Bob' }],
    })
    const rows = await getActiveSessions(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].board_id).toBe('board-1')
    expect(rows[0].game_id).toBe('atc')
  })

  it('getSessionById finds the session', async () => {
    const row = await getSessionById(db, '01JTEST00000000000000000AA')
    expect(row).toBeDefined()
    expect(row!.id).toBe('01JTEST00000000000000000AA')
  })

  it('setSessionFinished removes from active', async () => {
    await setSessionFinished(db, '01JTEST00000000000000000AA')
    const rows = await getActiveSessions(db)
    expect(rows).toHaveLength(0)
  })
})

describe('insertBridgeEvent', () => {
  it('inserts and returns inserted=true', async () => {
    const ev = {
      bridge_id: 'bridge-1', boot_id: 'boot-1', seq: BigInt(1),
      board_id: 'board-1', recv_wall: new Date(),
      kind: 'dart.detected', data: { index: 0 },
    }
    const r1 = await insertBridgeEvent(db, ev)
    expect(r1.inserted).toBe(true)
  })

  it('duplicate returns inserted=false', async () => {
    const ev = {
      bridge_id: 'bridge-1', boot_id: 'boot-1', seq: BigInt(1),
      board_id: 'board-1', recv_wall: new Date(),
      kind: 'dart.detected', data: { index: 0 },
    }
    const r2 = await insertBridgeEvent(db, ev)
    expect(r2.inserted).toBe(false)
  })

  it('getBridgeEventsForBoard returns events since a date', async () => {
    const since = new Date(Date.now() - 60_000)
    const rows = await getBridgeEventsForBoard(db, 'board-1', since)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].kind).toBe('dart.detected')
  })
})
