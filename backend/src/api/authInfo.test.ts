import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { authInfoApiPlugin } from './authInfo.js'

describe('GET /api/auth-info', () => {
  const get = async (opts: { mail: boolean; verification: boolean; contactEmail: string | null }) => {
    const app = createFastify()
    await app.register(authInfoApiPlugin, opts)
    const res = await app.inject({ method: 'GET', url: '/api/auth-info' })
    return { status: res.statusCode, body: res.json() }
  }

  it('answers mail off, verification off when the deployment sends no mail', async () => {
    expect(await get({ mail: false, verification: false, contactEmail: null })).toEqual({
      status: 200,
      body: { mail: false, verification: false, contactEmail: null },
    })
  })

  it('answers mail on, verification required when the deployment requires it', async () => {
    expect(await get({ mail: true, verification: true, contactEmail: 'hi@x.org' })).toEqual({
      status: 200,
      body: { mail: true, verification: true, contactEmail: 'hi@x.org' },
    })
  })
})
