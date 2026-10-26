import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import rateLimit from '@fastify/rate-limit'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import type { Mail } from '../mail/transport.js'
import { createFastify } from './fastify.js'
import { feedbackAddress, feedbackApiPlugin } from './feedback.js'

// Signed in as whoever the x-user header names; without it, not signed in (adminUsers.test.ts's pattern)
vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, reply: any, done: () => void) => {
    if (!req.headers['x-user']) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    req.userId = req.headers['x-user']
    done()
  }),
}))

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])
const context = {
  route: '#/game/s1',
  userAgent: 'Mozilla/5.0 Test',
  viewport: '1440x900',
  locale: 'de-AT',
  version: 'v0.9.0',
  commit: 'abc1234',
  sessionId: 's1',
}
const report = (over: Record<string, unknown> = {}) => ({ kind: 'bug', message: 'The board froze', context, ...over })

describe('feedbackAddress', () => {
  it('takes FEEDBACK_EMAIL, falls back to LEGAL_CONTACT_EMAIL, and is null without either', () => {
    expect(feedbackAddress({ FEEDBACK_EMAIL: ' bugs@x.org ', LEGAL_CONTACT_EMAIL: 'hi@x.org' })).toBe('bugs@x.org')
    expect(feedbackAddress({ FEEDBACK_EMAIL: '', LEGAL_CONTACT_EMAIL: 'hi@x.org' })).toBe('hi@x.org')
    expect(feedbackAddress({})).toBeNull()
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)('POST /api/feedback', { timeout: 20_000 }, () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('feedback_api_test'))
    await db
      .insertInto('user')
      .values([
        { id: 'lena', name: 'Lena <b>', email: 'lena@example.com', emailVerified: true, image: null, role: 'moderator' },
        { id: 'max', name: 'Max', email: 'max@example.com', emailVerified: true, image: null, role: null },
      ])
      .execute()
  })
  afterAll(async () => {
    await close()
  })

  async function setup(to: string | null = 'ops@example.org', mail = true) {
    const sent: Mail[] = []
    const app = createFastify()
    await app.register(rateLimit, { global: false })
    await app.register(feedbackApiPlugin, { db, to, mailer: mail ? { send: m => sent.push(m) } : null })
    const post = (body: unknown, user: string | null = 'max') =>
      app.inject({ method: 'POST', url: '/api/feedback', headers: user ? { 'x-user': user } : {}, payload: body as object })
    return { sent, post }
  }

  it('needs a signed-in user', async () => {
    const { sent, post } = await setup()
    expect((await post(report(), null)).statusCode).toBe(401)
    expect(sent).toEqual([])
  })

  it('mails the report with the account from the database and the context, to the configured address', async () => {
    const { sent, post } = await setup()
    const res = await post(report({ screenshot: JPEG.toString('base64') }), 'lena')
    expect(res.statusCode).toBe(204)
    expect(sent).toHaveLength(1)
    const [m] = sent
    expect(m.to).toBe('ops@example.org')
    expect(m.subject).toContain('Bug')
    for (const v of [
      'lena',
      'lena@example.com',
      'moderator',
      '#/game/s1',
      'Mozilla/5.0 Test',
      '1440x900',
      'de-AT',
      'v0.9.0',
      'abc1234',
      's1',
    ])
      expect(m.text).toContain(v)
    expect(m.text).toContain('The board froze')
    expect(m.attachments).toEqual([{ filename: 'screenshot.jpg', content: JPEG, contentType: 'image/jpeg' }])
  })

  it('escapes the message and the name in the html', async () => {
    const { sent, post } = await setup()
    await post(report({ message: '<img src=x onerror=alert(1)>' }), 'lena')
    const html = sent[0].html
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('Lena <b>')
    expect(html).toContain('Lena &lt;b&gt;')
  })

  it('sends no attachment without a screenshot', async () => {
    const { sent, post } = await setup()
    expect((await post(report())).statusCode).toBe(204)
    expect(sent[0].attachments).toBeUndefined()
  })

  it.each([
    ['an unknown kind', report({ kind: 'rant' })],
    ['an empty message', report({ message: '' })],
    ['a blank message', report({ message: '   ' })],
    ['a message over 4000 characters', report({ message: 'x'.repeat(4001) })],
    ['a screenshot that is not a JPEG', report({ screenshot: Buffer.from('<svg/>').toString('base64') })],
  ])('refuses %s', async (_, body) => {
    const { sent, post } = await setup()
    expect((await post(body)).statusCode).toBe(400)
    expect(sent).toEqual([])
  })

  it('drops fields the spec does not name, so they never reach the mail', async () => {
    const { sent, post } = await setup()
    expect((await post({ ...report({ context: { ...context, cookie: 'sid=secret' } }), token: 'tok-secret' })).statusCode).toBe(204)
    expect(sent[0].text + sent[0].html).not.toContain('secret')
  })

  it('refuses a body over 3 MB', async () => {
    const { sent, post } = await setup()
    const res = await post(report({ message: 'x', screenshot: 'A'.repeat(3.2 * 1024 * 1024) }))
    expect(res.statusCode).toBe(413)
    expect(sent).toEqual([])
  })

  it('takes 5 reports per user an hour, counting each user on their own', async () => {
    const { post } = await setup()
    for (let i = 0; i < 5; i++) expect((await post(report())).statusCode).toBe(204)
    expect((await post(report())).statusCode).toBe(429)
    expect((await post(report(), 'lena')).statusCode).toBe(204)
  })

  it('answers 503 when the deployment has no mail or no address', async () => {
    for (const { sent, post } of [await setup(null), await setup('ops@example.org', false)]) {
      expect((await post(report())).statusCode).toBe(503)
      expect(sent).toEqual([])
    }
  })
})
