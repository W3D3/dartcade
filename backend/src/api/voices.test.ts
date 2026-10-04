import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { request } from 'http'
import type { AddressInfo } from 'net'
import rateLimit from '@fastify/rate-limit'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { makeZip } from '../caller/zipFixture.js'
import { createFastify } from './fastify.js'
import { voicesApiPlugin } from './voices.js'

// Signed in as whoever the x-user header names; without it, not signed in
vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, reply: any, done: () => void) => {
    if (!req.headers['x-user']) { reply.code(401).send({ error: 'unauthorized' }); return }
    req.userId = req.headers['x-user']; done()
  }),
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

  // Link imports answer from this instead of the internet: the zip above for any URL
  const fetchImpl = vi.fn((_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(new Response(zip)))
  afterEach(() => { fetchImpl.mockClear() })

  function makeApp(limitBytes = 1024 * 1024, uploadLimit?: number) {
    const app = createFastify()
    app.register(voicesApiPlugin, { db, limitBytes, fetchImpl, uploadLimit })
    return app
  }
  const importLink = (app: ReturnType<typeof makeApp>, url: string, user = 'a') => app.inject({
    method: 'POST', url: '/api/voice-packs/import', headers: { 'x-user': user }, payload: { url },
  })
  const upload = (app: ReturnType<typeof makeApp>, body: Buffer = zip, user: string | null = 'a') => app.inject({
    method: 'POST', url: '/api/voice-packs?name=en-GB-Arthur-Male-v4.zip',
    headers: { 'content-type': 'application/zip', ...(user && { 'x-user': user }) }, payload: body,
  })
  const get = (app: ReturnType<typeof makeApp>, url: string, user = 'a') => app.inject({ method: 'GET', url, headers: { 'x-user': user } })

  it('imports an upload, lists it, serves its manifest and clips', async () => {
    const app = makeApp()
    const res = await upload(app)
    expect(res.statusCode).toBe(201)
    const pack = res.json()
    const { total, ...summary } = res.json()
    expect(pack).toMatchObject({ name: 'en-GB Arthur (Male)', lang: 'en-GB', clips: 3, bytes: KEPT, total: 4 })
    expect(total).toBe(4)

    expect((await get(app, '/api/voice-packs')).json()).toEqual({ packs: [summary], usage: { bytes: KEPT, limitBytes: 1024 * 1024 } })

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
    expect(res.json()).toEqual({ error: 'Unsupported Media Type: application/json' })
  })

  describe('before the body is read', () => {
    const big = Buffer.alloc(5000)

    it('asks for sign-in first', async () => {
      const res = await upload(makeApp(undefined, 1000), big, null)
      expect(res.statusCode).toBe(401)
    })

    it('says imports are off first', async () => {
      const res = await upload(makeApp(0, 1000), big)
      expect(res.json()).toEqual({ error: 'Voice imports are turned off' })
    })

    it('refuses a body over the upload limit, and over the usual 1 MiB elsewhere', async () => {
      const res = await upload(makeApp(undefined, 1000), big)
      expect(res.statusCode).toBe(413)
      const link = await importLink(makeApp(), 'https://darts-downloads.peschi.org/' + 'x'.repeat(1024 * 1024))
      expect(link.statusCode).toBe(413)
      expect(fetchImpl).not.toHaveBeenCalled()
    })
  })

  it('refuses an import over the limit, or every import when they are off', async () => {
    const tight = makeApp(4000)
    expect((await upload(tight)).statusCode).toBe(201)
    const over = await upload(tight)
    expect(over.statusCode).toBe(413)
    expect(over.json().error).toBe('Voice storage limit reached: 2.9 of 3.9 KB used, this pack needs 2.9 KB')

    const off = await upload(makeApp(0))
    expect(off.statusCode).toBe(413)
    expect(off.json()).toEqual({ error: 'Voice imports are turned off' })
  })

  it('takes one import at a time per user', async () => {
    const app = makeApp()
    const [first, second] = await Promise.all([upload(app), upload(app)])
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 429])
  })

  describe('imports running', () => {
    const link = 'https://darts-downloads.peschi.org/x.zip'
    // Link imports whose download waits until released: after the test at the latest, which then
    // waits for them to finish, so a failing test doesn't leave imports running for the next ones
    const held: { release: () => void; res: ReturnType<typeof importLink> }[] = []
    afterEach(async () => {
      const all = held.splice(0)
      all.forEach(h => { h.release() })
      await Promise.all(all.map(h => h.res))
    })
    async function holdImport(app: ReturnType<typeof makeApp>, user: string) {
      let release = () => {}
      fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { release = () => resolve(new Response(zip)) }))
      const calls = fetchImpl.mock.calls.length
      const res = importLink(app, link, user)
      held.push({ release: () => release(), res })
      await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(calls + 1))
      return { release: () => release(), res }
    }

    it('refuses a second import of the same user before reading its body', async () => {
      const app = makeApp(undefined, 1000)
      const first = await holdImport(app, 'a')
      // Over the upload limit (a 413 once read) and not a zip: refused before either matters
      const second = await upload(app, Buffer.alloc(5000))
      expect(second.statusCode).toBe(429)
      expect(second.json()).toEqual({ error: 'An import is already running' })
      first.release()
      expect((await first.res).statusCode).toBe(201)
    })

    it('runs two imports at once across all users', async () => {
      await db.insertInto('user').values({ id: 'c', name: 'Cleo', email: 'c@example.com', emailVerified: false, image: null })
        .onConflict(oc => oc.doNothing()).execute()
      const app = makeApp()
      const running = [await holdImport(app, 'a'), await holdImport(app, 'b')]
      for (const res of [await upload(app, zip, 'c'), await importLink(app, link, 'c')]) {
        expect(res.statusCode).toBe(429)
        expect(res.json()).toEqual({ error: 'The server is busy importing voices, try again in a minute' })
      }
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      running.forEach(r => { r.release() })
      for (const r of running) expect((await r.res).statusCode).toBe(201)
      expect((await upload(app, zip, 'c')).statusCode).toBe(201)
    })

    // An upload to a listening app whose body is still coming in: finish() sends the rest of the
    // zip, drop() closes the connection
    function slowUpload(app: ReturnType<typeof makeApp>, user: string) {
      const { port } = app.server.address() as AddressInfo
      const req = request({
        host: '127.0.0.1', port, method: 'POST', path: '/api/voice-packs?name=x.zip',
        headers: { 'content-type': 'application/zip', 'content-length': String(zip.length), 'x-user': user },
      })
      const status = new Promise<number | undefined>((resolve, reject) => {
        req.on('response', res => { res.resume(); res.on('end', () => { resolve(res.statusCode) }) })
        req.on('error', reject)
      })
      status.catch(() => {})
      req.write(zip.subarray(0, 10))
      return { status, finish: () => { req.end(zip.subarray(10)) }, drop: () => { req.destroy() } }
    }
    async function listening(app: ReturnType<typeof makeApp>) {
      await app.listen({ port: 0, host: '127.0.0.1' })
      return app
    }

    it('counts uploads still receiving their body against the two at once', async () => {
      await db.insertInto('user').values({ id: 'c', name: 'Cleo', email: 'c@example.com', emailVerified: false, image: null })
        .onConflict(oc => oc.doNothing()).execute()
      const app = await listening(makeApp(undefined, 1000))
      try {
        const slow = [slowUpload(app, 'a'), slowUpload(app, 'b')]
        let done: (number | undefined)[] = []
        try {
          // Over the upload limit (a 413 once read): refused before its body is
          await vi.waitFor(async () => {
            const third = await upload(app, Buffer.alloc(5000), 'c')
            expect(third.json()).toEqual({ error: 'The server is busy importing voices, try again in a minute' })
            expect(third.statusCode).toBe(429)
          })
          expect((await upload(app, Buffer.alloc(5000), 'a')).json()).toEqual({ error: 'An import is already running' })
        } finally {
          slow.forEach(s => { s.finish() })
          done = await Promise.all(slow.map(s => s.status))
        }
        expect(done).toEqual([201, 201])
        expect((await upload(app, zip, 'c')).statusCode).toBe(201)
      } finally {
        await app.close()
      }
    })

    it('frees the slot after an error response', async () => {
      const app = makeApp(undefined, 1000)
      expect((await upload(app, Buffer.alloc(5000))).statusCode).toBe(413)
      expect((await upload(app, Buffer.from('no zip'))).statusCode).toBe(400)
      expect((await upload(app, zip)).statusCode).toBe(201)
    })

    it('frees the slot when the upload is dropped mid-body', async () => {
      const app = await listening(makeApp())
      try {
        const slow = slowUpload(app, 'a')
        // The slot is taken while the body comes in
        await vi.waitFor(async () => { expect((await upload(app, Buffer.from('no zip'))).statusCode).toBe(429) })
        slow.drop()
        await vi.waitFor(async () => { expect((await upload(app, zip)).statusCode).toBe(201) })
      } finally {
        await app.close()
      }
    })
  })

  it('deletes a pack', async () => {
    const app = makeApp()
    const pack = (await upload(app)).json()
    const del = () => app.inject({ method: 'DELETE', url: `/api/voice-packs/${pack.id}`, headers: { 'x-user': 'a' } })
    expect((await del()).statusCode).toBe(204)
    expect((await del()).statusCode).toBe(404)
    expect((await get(app, `/api/voice-clips/${sha(ONE80)}`)).statusCode).toBe(404)
  })

  it('imports a pack from a link on an allowed host', async () => {
    const app = makeApp()
    const res = await importLink(app, 'https://darts-downloads.peschi.org/soundfiles/en-GB-Arthur-Male-v4.zip')
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ name: 'en-GB Arthur (Male)', lang: 'en-GB', clips: 3, bytes: KEPT, total: 4 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://darts-downloads.peschi.org/soundfiles/en-GB-Arthur-Male-v4.zip')
    expect((await get(app, '/api/voice-packs')).json().packs).toHaveLength(1)
  })

  it('refuses a link off the list without fetching it', async () => {
    const res = await importLink(makeApp(), 'http://169.254.169.254/latest/meta-data/')
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: "Links from this site aren't supported" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a link that is not a pack, or a body without a url', async () => {
    fetchImpl.mockResolvedValueOnce(new Response('hello'))
    const notZip = await importLink(makeApp(), 'https://darts-downloads.peschi.org/x.zip')
    expect(notZip.statusCode).toBe(400)
    expect(notZip.json()).toEqual({ error: 'Not a zip file' })

    const noUrl = await makeApp().inject({ method: 'POST', url: '/api/voice-packs/import', headers: { 'x-user': 'a' }, payload: {} })
    expect(noUrl.statusCode).toBe(400)
  })

  it('applies the limit and the one-import lock to links too', async () => {
    const off = await importLink(makeApp(0), 'https://darts-downloads.peschi.org/x.zip')
    expect(off.statusCode).toBe(413)
    expect(fetchImpl).not.toHaveBeenCalled()

    const tight = makeApp(4000)
    expect((await upload(tight)).statusCode).toBe(201)
    expect((await importLink(tight, 'https://darts-downloads.peschi.org/x.zip')).statusCode).toBe(413)

    const app = makeApp()
    const [a, b] = await Promise.all([upload(app), importLink(app, 'https://darts-downloads.peschi.org/x.zip')])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 429])
  })

  it('leaves clips out of the rate limit', async () => {
    const app = createFastify()
    await app.register(rateLimit, { max: 2, timeWindow: '1 minute' })
    app.register(voicesApiPlugin, { db, limitBytes: 1024 * 1024, fetchImpl })
    expect((await upload(app)).statusCode).toBe(201)
    for (let i = 0; i < 5; i++) expect((await get(app, `/api/voice-clips/${sha(ONE80)}`)).statusCode).toBe(200)
    // The upload counts against its own limit; the list against the usual one
    expect((await get(app, '/api/voice-packs')).statusCode).toBe(200)
    expect((await get(app, '/api/voice-packs')).statusCode).toBe(200)
    expect((await get(app, '/api/voice-packs')).statusCode).toBe(429)
  })

  it('takes ten uploads and ten link imports a minute', async () => {
    const app = createFastify()
    await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
    app.register(voicesApiPlugin, { db, limitBytes: 1024 * 1024, fetchImpl })
    // Refused quickly (not a zip, a link off the list) but counted all the same
    for (let i = 0; i < 10; i++) expect((await upload(app, Buffer.from('no zip'))).statusCode).toBe(400)
    expect((await upload(app, Buffer.from('no zip'))).statusCode).toBe(429)
    for (let i = 0; i < 10; i++) expect((await importLink(app, 'https://example.com/x.zip')).statusCode).toBe(400)
    expect((await importLink(app, 'https://example.com/x.zip')).statusCode).toBe(429)
    expect((await get(app, '/api/voice-packs')).statusCode).toBe(200)
  })
})
