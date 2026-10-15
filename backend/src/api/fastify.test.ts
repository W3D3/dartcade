import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'

describe('createFastify', () => {
  const app = () => {
    const a = createFastify()
    a.post('/empty', () => ({ ok: true }))
    a.post('/json', req => ({ body: req.body }))
    return a
  }

  it('takes a POST without a body whatever content type it claims', async () => {
    for (const type of ['application/octet-stream', 'application/x-www-form-urlencoded', 'text/plain']) {
      const res = await app().inject({ method: 'POST', url: '/empty', headers: { 'content-type': type, 'content-length': '0' } })
      expect(res.statusCode, type).toBe(200)
    }
  })

  // A proxy can forward an empty POST chunked, with no Content-Length, and add a content type
  it('takes a chunked POST without a body whatever content type it claims', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/empty',
      headers: { 'content-type': 'application/octet-stream', 'transfer-encoding': 'chunked' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('still refuses a body of a type it cannot parse', async () => {
    const res = await app().inject({ method: 'POST', url: '/json', headers: { 'content-type': 'application/octet-stream' }, payload: 'x' })
    expect(res.statusCode).toBe(415)
  })

  it('still parses a JSON body', async () => {
    const res = await app().inject({ method: 'POST', url: '/json', payload: { a: 1 } })
    expect(res.json()).toEqual({ body: { a: 1 } })
  })
})
