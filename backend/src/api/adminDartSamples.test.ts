import { useDbSingleton } from '../test/db.js'
import '../test/authByHeader.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import { extract } from 'tar-stream'
import { Readable } from 'node:stream'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertBridgeEvent } from '../db/queries.js'
import { insertSample } from '../db/dartSamples.js'
import { createFastify } from './fastify.js'
import { adminDartSamplesApiPlugin } from './adminDartSamples.js'
import { insertUsers } from '../test/fixtures.js'

const HOUR = 3_600_000

/** The tar's files, by name. */
async function untar(body: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>()
  const ex = extract()
  const done = new Promise<void>((resolve, reject) => {
    ex.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = []
      stream.on('data', (c: unknown) => {
        if (Buffer.isBuffer(c)) chunks.push(c)
      })
      stream.on('end', () => {
        files.set(header.name, Buffer.concat(chunks))
        next()
      })
    })
    ex.on('finish', resolve)
    ex.on('error', reject)
  })
  Readable.from([body]).pipe(ex)
  await done
  return files
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('admin dart samples API', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const ids: string[] = []

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('admin_dart_samples_api_test'))
    useDbSingleton(db)
    await insertUsers(db, [
      { id: 'admin', name: 'Admin', emailVerified: true, role: 'admin' },
      { id: 'player', name: 'Player', emailVerified: true },
    ])
    await db
      .insertInto('boards')
      .values({ id: 'b1', owner_user_id: 'player', name: 'Board', token_hash: 'h1', hardware_id: 'hw1' })
      .execute()
    for (const seq of [1, 2]) {
      const { id } = await insertBridgeEvent(db, {
        bridge_id: 'br',
        boot_id: 'bt',
        seq: BigInt(seq),
        board_id: 'hw1',
        recv_wall: new Date(),
        kind: 'dart.detected',
        data: { visit_id: 'v', index: 0, source_seq: seq, dart: { segment: { name: 'T20' }, coords: { x: 0, y: 0.6 } } },
      })
      if (id === null) throw new Error('not stored')
      const still = (phase: string, cam: number) => Buffer.from(`${seq}-${phase}-${cam}`)
      await insertSample(db, {
        boardId: 'b1',
        bridgeEventId: id,
        sourceSeq: seq,
        bmVersion: '2.1.0',
        before: [0, 1, 2].map(c => still('before', c)),
        after: [0, 1, 2].map(c => still('after', c)),
      })
    }
    const rows = await db.selectFrom('dart_samples').select('id').orderBy('id').execute()
    ids.push(...rows.map(r => r.id))
  })
  afterAll(async () => {
    await close()
  })

  // `now` an hour and a bit ahead, so both samples are settled
  async function get(url: string, user?: string, now = Date.now() + HOUR + 60_000) {
    const app = createFastify()
    await app.register(adminDartSamplesApiPlugin, { db, maxBytes: 1000, now: () => now })
    return app.inject({ method: 'GET', url, headers: user ? { 'x-user': user } : {} })
  }

  it('is for admins only', async () => {
    expect((await get('/api/admin/dart-samples')).statusCode).toBe(401)
    expect((await get('/api/admin/dart-samples', 'player')).statusCode).toBe(403)
    expect((await get(`/api/admin/dart-samples/export?upTo=${ids[1]}`, 'player')).statusCode).toBe(403)
    expect((await get(`/api/admin/dart-samples/${ids[0]}/stills/after/0`, 'player')).statusCode).toBe(403)
  })

  it('lists the samples with their totals and the newest one a download can include', async () => {
    const body = (await get('/api/admin/dart-samples', 'admin')).json()
    expect(body.totals).toMatchObject({ byLabel: { autodarts: 2, corrected_spot: 0, corrected_segment: 0 }, boards: 1, maxBytes: 1000 })
    expect(body.samples.map((s: { id: string }) => s.id)).toEqual([ids[1], ids[0]])
    expect(body.samples[0]).toMatchObject({ autodarts: { segment: 'T20', coords: { x: 0, y: 0.6 } }, final: null, label: 'autodarts' })
    expect(body.settledNewestId).toBe(ids[1])
    // Not an hour old yet: nothing to download
    expect((await get('/api/admin/dart-samples', 'admin', Date.now())).json().settledNewestId).toBeNull()
  })

  it('serves a still', async () => {
    const res = await get(`/api/admin/dart-samples/${ids[0]}/stills/before/2`, 'admin')
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.body).toBe('1-before-2')
    expect((await get(`/api/admin/dart-samples/${ids[0]}/stills/before/3`, 'admin')).statusCode).toBe(400)
  })

  it('downloads the samples after a cursor as a tar of stills and labels', async () => {
    const res = await get(`/api/admin/dart-samples/export?upTo=${ids[1]}`, 'admin')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toBe(`attachment; filename="dart-samples-0-${ids[1]}.tar"`)
    const files = await untar(res.rawPayload)
    expect([...files.keys()]).toHaveLength(13)
    expect(files.get(`${ids[1]}/after-1.jpg`)?.toString()).toBe('2-after-1')
    const labels = files
      .get('labels.jsonl')
      ?.toString()
      .trim()
      .split('\n')
      .map(l => JSON.parse(l) as { id: string })
    expect(labels?.map(l => l.id)).toEqual(ids)

    const next = await untar((await get(`/api/admin/dart-samples/export?after=${ids[0]}&upTo=${ids[1]}`, 'admin')).rawPayload)
    expect(next.get('labels.jsonl')?.toString().trim().split('\n')).toHaveLength(1)
  })
})
