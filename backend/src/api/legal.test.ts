import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { legalApiPlugin } from './legal.js'
import { loadLegal, legalValues } from '../legal/load.js'

describe('GET /api/legal/{doc}', () => {
  const build = async () => {
    const docs = await loadLegal(undefined, legalValues({ LEGAL_OPERATOR_NAME: 'Chris W.' }))
    const app = createFastify()
    await app.register(legalApiPlugin, { docs })
    return app
  }

  it('answers 200 with html and the updated date', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/api/legal/terms' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.html).toContain('<h1')
    expect(body.updated).toBeNull()
  })

  it('answers 400 for an unknown doc', async () => {
    const app = await build()
    const res = await app.inject({ method: 'GET', url: '/api/legal/cookies' })
    expect(res.statusCode).toBe(400)
  })
})
