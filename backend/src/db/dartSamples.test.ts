import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { appendSessionEvent, insertBridgeEvent, insertGameDarts, insertGameSession, runMigrations } from './queries.js'
import {
  exportSamples,
  insertSample,
  listSamples,
  pruneSamples,
  sampleStill,
  sampleStills,
  sampleTotals,
  setBoardShares,
} from './dartSamples.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
const SCHEMA = 'dart_samples_test'

const segment = (name: string) => ({ name, number: 20, bed: 'SingleOuter', multiplier: 1 })
const LATER = new Date(Date.now() + 3_600_000)

describe.skipIf(!process.env.TEST_DATABASE_URL)('dart sample queries', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>
  let seq = 0

  /** A dart.detected from board b1, kept as a sample; its bridge event id. */
  async function sample(name: string, coords = { x: 0.1, y: 0.2 }, bytes = 10): Promise<string> {
    const { id } = await insertBridgeEvent(db, {
      bridge_id: 'br',
      boot_id: 'bt',
      seq: BigInt(++seq),
      board_id: 'hw1',
      recv_wall: new Date(),
      kind: 'dart.detected',
      data: { visit_id: 'v', index: 0, source_seq: seq, dart: { segment: segment(name), coords, score: 20 } },
    })
    if (id === null) throw new Error('bridge event not stored')
    const jpeg = Buffer.alloc(bytes / 6 || 1, seq)
    await insertSample(db, {
      boardId: 'b1',
      bridgeEventId: id,
      sourceSeq: seq,
      bmVersion: '2.1.0',
      before: [jpeg, jpeg, jpeg],
      after: [jpeg, jpeg, jpeg],
    })
    return id
  }

  /** Logs the bridge event as game g's input `n` and commits it as that game's dart. */
  async function inGame(
    g: string,
    n: number,
    bridgeEventId: string,
    dart: { name: string; coords: { x: number; y: number } | null; corrected: boolean },
  ) {
    const at = new Date(Date.UTC(2026, 10, 1, 10, 0, n))
    await appendSessionEvent(db, {
      session_id: g,
      seq: n,
      source: 'board',
      kind: 'dart.detected',
      data: {},
      bridge_event_id: bridgeEventId,
      board_db_id: 'b1',
      created_at: at,
    })
    await insertGameDarts(db, [
      {
        session_id: g,
        visit: n,
        dart_index: 0,
        seat: 0,
        leg: 0,
        phase: 'game',
        segment: segment(dart.name),
        coords: dart.coords,
        source: 'camera',
        corrected: dart.corrected,
        thrown_at: at,
      },
    ])
  }

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db)
    await db
      .insertInto('user')
      .values({ id: 'u1', name: 'Ann', email: 'ann@example.com', emailVerified: true, image: null, role: null })
      .execute()
  })

  beforeEach(async () => {
    await db.deleteFrom('game_sessions').execute()
    await db.deleteFrom('boards').execute()
    await db.deleteFrom('bridge_events').execute()
    await db.insertInto('boards').values({ id: 'b1', owner_user_id: 'u1', name: 'Board', token_hash: 'h1', hardware_id: 'hw1' }).execute()
    for (const g of ['g1', 'g2']) {
      await insertGameSession(db, {
        id: g,
        owner_user_id: 'u1',
        board_db_id: 'b1',
        game_id: 'x01',
        game_version: 1,
        rng_seed: 0,
        config: {},
        players: [{ name: 'Ann', user_id: 'u1', controller_user_id: 'u1', board_db_id: 'b1', bot_level: null }],
      })
    }
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it("labels each sample from its game's final dart", async () => {
    const untouched = await sample('S20')
    const dragged = await sample('S20')
    const picked = await sample('S20')
    await sample('T19') // thrown outside any game
    await inGame('g1', 0, untouched, { name: 'S20', coords: { x: 0.1, y: 0.2 }, corrected: false })
    await inGame('g1', 1, dragged, { name: 'T20', coords: { x: 0, y: 0.6 }, corrected: true })
    await inGame('g1', 2, picked, { name: 'D20', coords: null, corrected: true })

    const rows = await exportSamples(db, { limit: 10, settledBefore: LATER })
    expect(rows.map(r => [r.label, r.autodarts.segment, r.final?.segment ?? null, r.final?.coords ?? null])).toEqual([
      ['autodarts', 'S20', 'S20', { x: 0.1, y: 0.2 }],
      ['corrected_spot', 'S20', 'T20', { x: 0, y: 0.6 }],
      ['corrected_segment', 'S20', 'D20', null],
      ['autodarts', 'T19', null, null],
    ])
    expect(rows[0]).toMatchObject({ boardId: 'b1', bmVersion: '2.1.0', autodarts: { coords: { x: 0.1, y: 0.2 } } })
  })

  it('filters by label, pages by id, and waits for a dart to settle', async () => {
    const a = await sample('S20')
    const b = await sample('S20')
    await inGame('g1', 0, b, { name: 'T20', coords: { x: 0, y: 0.6 }, corrected: true })
    const all = await exportSamples(db, { limit: 10, settledBefore: LATER })
    const [first] = all
    expect(all).toHaveLength(2)
    expect((await exportSamples(db, { limit: 10, settledBefore: LATER, label: 'corrected_spot' })).map(r => r.final?.segment)).toEqual([
      'T20',
    ])
    expect(await exportSamples(db, { limit: 10, settledBefore: LATER, afterId: first.id })).toHaveLength(1)
    expect(await exportSamples(db, { limit: 10, settledBefore: new Date(Date.now() - 60_000) })).toEqual([])
    expect((await listSamples(db, { limit: 10 })).map(r => r.autodarts.segment)).toHaveLength(2)
    expect(await listSamples(db, { limit: 10, label: 'autodarts' })).toHaveLength(1)
    expect(a).not.toEqual(b)
  })

  it('leaves out darts of an invalidated game', async () => {
    const kept = await sample('S20')
    const dropped = await sample('S20')
    await inGame('g1', 0, kept, { name: 'S20', coords: null, corrected: false })
    await inGame('g2', 0, dropped, { name: 'S20', coords: null, corrected: false })
    await sql`UPDATE game_sessions SET invalidated_at = now() WHERE id = 'g2'`.execute(db)
    expect(await exportSamples(db, { limit: 10, settledBefore: LATER })).toHaveLength(1)
  })

  it('stores a dart once, with its six stills', async () => {
    await sample('S20')
    const [row] = await listSamples(db, { limit: 10 })
    expect(await sampleStills(db, [row.id])).toHaveLength(6)
    expect(await sampleStill(db, row.id, 'after', 2)).toBeInstanceOf(Buffer)
    const again = await db.selectFrom('dart_samples').select('bridge_event_id').executeTakeFirstOrThrow()
    const jpeg = Buffer.from('x')
    await insertSample(db, {
      boardId: 'b1',
      bridgeEventId: again.bridge_event_id,
      sourceSeq: 1,
      bmVersion: null,
      before: [jpeg, jpeg, jpeg],
      after: [jpeg, jpeg, jpeg],
    })
    expect(await listSamples(db, { limit: 10 })).toHaveLength(1)
  })

  it("deletes a board's samples when its owner turns sharing off, and when the board goes", async () => {
    await sample('S20')
    await setBoardShares(db, 'b1', false)
    expect(await listSamples(db, { limit: 10 })).toEqual([])
    expect(await db.selectFrom('dart_sample_stills').selectAll().execute()).toEqual([])
    await setBoardShares(db, 'b1', true)
    await sample('S20')
    await db.deleteFrom('boards').where('id', '=', 'b1').execute()
    expect(await db.selectFrom('dart_sample_stills').selectAll().execute()).toEqual([])
  })

  it('counts samples by label and the bytes they take', async () => {
    const corrected = await sample('S20', undefined, 60)
    await sample('S20', undefined, 60)
    await inGame('g1', 0, corrected, { name: 'T20', coords: null, corrected: true })
    const totals = await sampleTotals(db)
    expect(totals).toMatchObject({
      byLabel: { autodarts: 1, corrected_spot: 0, corrected_segment: 1 },
      boards: 1,
      sharingBoards: 1,
      bytes: 120,
    })
    expect(totals.newest).toBeInstanceOf(Date)
  })

  it('keeps under the cap by dropping the oldest uncorrected samples first', async () => {
    const corrected = await sample('S20', undefined, 60) // oldest, but corrected
    await sample('S20', undefined, 60)
    await sample('S20', undefined, 60)
    const newest = await sample('S20', undefined, 60)
    await inGame('g1', 0, corrected, { name: 'T20', coords: null, corrected: true })
    expect(await pruneSamples(db, 240)).toBe(0)
    expect(await pruneSamples(db, 130)).toBe(2)
    const left = await db.selectFrom('dart_samples').select('bridge_event_id').orderBy('id').execute()
    expect(left.map(r => r.bridge_event_id)).toEqual([corrected, newest])
  })
})
