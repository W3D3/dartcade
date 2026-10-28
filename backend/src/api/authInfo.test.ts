import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { authInfoApiPlugin } from './authInfo.js'

describe('GET /api/auth-info', () => {
  const get = async (opts: { mail: boolean; verification: boolean; contactEmail: string | null; feedback: boolean; discord: boolean }) => {
    const app = createFastify()
    await app.register(authInfoApiPlugin, opts)
    const res = await app.inject({ method: 'GET', url: '/api/auth-info' })
    return { status: res.statusCode, body: res.json() }
  }

  it('answers mail off, verification off when the deployment sends no mail', async () => {
    expect(await get({ mail: false, verification: false, contactEmail: null, feedback: false, discord: false })).toEqual({
      status: 200,
      body: { mail: false, verification: false, contactEmail: null, feedback: false, discord: false },
    })
  })

  it('answers mail on, verification required and Discord on when the deployment has them', async () => {
    expect(await get({ mail: true, verification: true, contactEmail: 'hi@x.org', feedback: true, discord: true })).toEqual({
      status: 200,
      body: { mail: true, verification: true, contactEmail: 'hi@x.org', feedback: true, discord: true },
    })
  })
})
