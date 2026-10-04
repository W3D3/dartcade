import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { createHash } from 'crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { makeZip } from '../caller/zipFixture.js'
import { createFastify } from './fastify.js'
import { voicesApiPlugin } from './voices.js'

// Signed in as whoever the x-user header names
vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = req.headers['x-user']; done() }),
}))

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
// Three clips of 1000 bytes each, named by key; "murmel" isn't a caller key and is dropped
const [ONE80, GS, GS2] = ['1', '2', '3'].map(c => c.repeat(1000))
const zip = Buffer.from(makeZip([
  { name: '180.mp3', data: ONE80 },
  { name: 'gameshot.mp3', data: GS },
  { name: 'gameshot+1.wav', data: GS2 },
  { name: 'murmel.mp3', data: 'murmel' },
]))
const KEPT = 3000

describe.skipIf(!process.env.TEST_DATABASE_URL)('voice packs API', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('voices_api_test'))
    await db.insertInto('user').values([
      { id: 'a', name: 'Anna', email: 'a@example.com', emailVerified: false, image: null },
      { id: 'b', name: 'Ben', email: 'b@example.com', emailVerified: false, image: null },
    ]).execute()
  })
  afterAll(async () => { await close() })
  afterEach(async () => { await db.deleteFrom('voice_packs').execute(); await db.deleteFrom('voice_clips').execute() })

  function makeApp(limitBytes = 1024 * 1024) {
    const app = createFastify()
    app.register(voicesApiPlugin, { db, limitBytes })
    return app
  }
  const upload = (app: ReturnType<typeof makeApp>, body: Buffer = zip, user = 'a') => app.inject({
    method: 'POST', url: '/api/voice-packs?name=en-GB-Arthur-Male-v4.zip',
    headers: { 'content-type': 'application/zip', 'x-user': user }, payload: body,
  })
  const get = (app: ReturnType<typeof makeApp>, url: string, user = 'a') => app.inject({ method: 'GET', url, headers: { 'x-user': user } })

  it('imports an upload, lists it, serves its manifest and clips', async () => {
    const app = makeApp()
    const res = await upload(app)
    expect(res.statusCode).toBe(201)
    const pack = res.json()
    expect(pack).toMatchObject({ name: 'en-GB Arthur (Male)', lang: 'en-GB', clips: 3, bytes: KEPT })

    expect((await get(app, '/api/voice-packs')).json()).toEqual({ packs: [pack], usage: { bytes: KEPT, limitBytes: 1024 * 1024 } })

    const manifest = await get(app, `/api/voice-packs/${pack.id}`)
    expect(manifest.json()).toEqual({
      id: pack.id, name: 'en-GB Arthur (Male)',
      clips: { '180': [sha(ONE80)], gameshot: [sha(GS), sha(GS2)] },
    })

    const clip = await get(app, `/api/voice-clips/${sha(GS2)}`)
    expect(clip.statusCode).toBe(200)
    expect(clip.headers['content-type']).toBe('audio/wav')
    expect(clip.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect(clip.body).toBe(GS2)
  })

  it('hides a pack and its clips from other users', async () => {
    const app = makeApp()
    const pack = (await upload(app)).json()
    expect((await get(app, `/api/voice-packs/${pack.id}`, 'b')).statusCode).toBe(404)
    expect((await get(app, `/api/voice-clips/${sha(ONE80)}`, 'b')).statusCode).toBe(404)
    expect((await get(app, '/api/voice-packs', 'b')).json()).toEqual({ packs: [], usage: { bytes: 0, limitBytes: 1024 * 1024 } })
    expect((await app.inject({ method: 'DELETE', url: `/api/voice-packs/${pack.id}`, headers: { 'x-user': 'b' } })).statusCode).toBe(404)
  })

  it('refuses what is not a zip', async () => {
    const res = await upload(makeApp(), Buffer.from('hello'))
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'Not a zip file' })
  })

  it('refuses another content type', async () => {
    const res = await makeApp().inject({
      method: 'POST', url: '/api/voice-packs?name=x.zip', headers: { 'content-type': 'application/json', 'x-user': 'a' }, payload: '{}',
    })
    expect(res.statusCode).toBe(415)
  })

  it('refuses an import over the limit, or every import when they are off', async () => {
    const tight = makeApp(4000)
    expect((await upload(tight)).statusCode).toBe(201)
    const over = await upload(tight)
    expect(over.statusCode).toBe(413)
    expect(over.json().error).toBe('Voice storage limit reached: 2.9 of 3.9 KB used')

    const off = await upload(makeApp(0))
    expect(off.statusCode).toBe(413)
    expect(off.json()).toEqual({ error: 'Voice imports are turned off' })
  })

  it('takes one import at a time per user', async () => {
    const app = makeApp()
    const [first, second] = await Promise.all([upload(app), upload(app)])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 429])
  })

  it('deletes a pack', async () => {
    const app = makeApp()
    const pack = (await upload(app)).json()
    const del = () => app.inject({ method: 'DELETE', url: `/api/voice-packs/${pack.id}`, headers: { 'x-user': 'a' } })
    expect((await del()).statusCode).toBe(204)
    expect((await del()).statusCode).toBe(404)
    expect((await get(app, `/api/voice-clips/${sha(ONE80)}`)).statusCode).toBe(404)
  })
})
