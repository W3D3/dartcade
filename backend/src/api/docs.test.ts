import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'
import { auth } from '../auth/index.js'

describe('API docs', () => {
  it('serves our spec for Swagger UI', async () => {
    const app = await buildApp({ engine: {} as any, db: {} as any })
    const res = await app.inject('/api/docs/json')
    expect(res.statusCode).toBe(200)
    const doc = JSON.parse(res.body)
    expect(doc.openapi).toBe('3.0.3')
    expect(Object.keys(doc.paths)).toContain('/api/sessions')
    const ui = await app.inject('/api/docs')
    expect([200, 302]).toContain(ui.statusCode)
    await app.close()
  })

  it("generates better-auth's OpenAPI document", async () => {
    const doc = await auth.api.generateOpenAPISchema()
    expect(doc.openapi).toMatch(/^3\.1/)
    expect(Object.keys(doc.paths).some(p => p.includes('sign-in'))).toBe(true)
  })
})
