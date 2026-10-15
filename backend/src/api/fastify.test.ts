import { describe, it, expect } from 'vitest'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
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

  it('takes an empty chunked POST, with or without a content type', async () => {
    // inject() always sends a content length, so this goes over a real socket
    const a = app()
    await a.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = a.server.address() as AddressInfo
      for (const type of [undefined, 'application/octet-stream']) {
        const status = await new Promise<number | undefined>((resolve, reject) => {
          const headers = { 'transfer-encoding': 'chunked', ...(type && { 'content-type': type }) }
          request({ host: '127.0.0.1', port, method: 'POST', path: '/empty', headers }, res => {
            res.resume()
            resolve(res.statusCode)
          })
            .on('error', reject)
            .end()
        })
        expect(status, type).toBe(200)
      }
    } finally {
      await a.close()
    }
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
