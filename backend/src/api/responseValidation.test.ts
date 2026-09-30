import { describe, it, expect, afterEach, vi } from 'vitest'
import { createFastify } from './fastify.js'

afterEach(() => vi.unstubAllEnvs())

// Routes carry only the operationId (no response schema), so the serializer can't coerce
// the payload and the hook sees exactly what the handler returned.
function app(handler: (reply: any) => unknown, operationId = 'health') {
  const a = createFastify()
  a.get('/x', { schema: { operationId } as any }, async (_req, reply) => handler(reply))
  return a
}

describe('response validation (dev/test)', () => {
  it('passes a response that matches the spec', async () => {
    expect((await app(() => ({ ok: true })).inject('/x')).statusCode).toBe(200)
  })

  it('turns a mismatching body into a 500 naming the operation', async () => {
    const res = await app(() => ({ ok: 'yes' })).inject('/x')
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toMatchObject({ error: 'response does not match the API spec', details: [{ path: 'health' }] })
  })

  it('turns an undocumented status into a 500', async () => {
    const res = await app(reply => reply.code(418).send({ ok: true })).inject('/x')
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatch(/undocumented status 418/)
  })

  it('lets 204 responses through untouched', async () => {
    const res = await app(reply => reply.code(204).send(), 'deleteSession').inject('/x')
    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
  })

  it('lets non-JSON bodies through untouched', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff])
    const res = await app(reply => reply.header('content-type', 'image/jpeg').send(jpeg), 'getBoardCamera').inject('/x')
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.equals(jpeg)).toBe(true)
  })

  it('is off in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await app(() => ({ ok: 'yes' })).inject('/x')).statusCode).toBe(200)
  })
})
