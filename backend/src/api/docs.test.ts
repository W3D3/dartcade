import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'
import { auth } from '../auth/index.js'

describe('API docs', () => {
  it('serves our spec for Swagger UI', async () => {
    const app = await buildApp({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any })
    const res = await app.inject('/api/docs/json')
    expect(res.statusCode).toBe(200)
    const doc = JSON.parse(res.body)
    expect(doc.openapi).toBe('3.0.3')
    expect(Object.keys(doc.paths)).toContain('/api/sessions')
    const ui = await app.inject('/api/docs')
    expect([200, 302]).toContain(ui.statusCode)
    await app.close()
  })

  it('serves working asset links from /api/docs (no trailing slash)', async () => {
    const app = await buildApp({ engine: {} as any, db: {} as any, lobbies: {} as any, hub: {} as any })

    let page = await app.inject('/api/docs')
    let pageUrl = '/api/docs'
    if ([301, 302, 307, 308].includes(page.statusCode)) {
      const location = page.headers.location as string
      pageUrl = location
      page = await app.inject(location)
    }
    expect(page.statusCode).toBe(200)

    const refs = [...page.body.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
    expect(refs.length).toBeGreaterThan(0)

    for (const ref of refs) {
      const resolvedPath = new URL(ref, 'http://x' + pageUrl).pathname
      const assetRes = await app.inject(resolvedPath)
      expect(assetRes.statusCode, `${ref} -> ${resolvedPath}`).toBe(200)
    }

    const spec = await app.inject('/api/docs/json')
    expect(spec.statusCode).toBe(200)
    expect(JSON.parse(spec.body).openapi).toBe('3.0.3')

    await app.close()
  })

  it("generates better-auth's OpenAPI document", async () => {
    const doc = await auth.api.generateOpenAPISchema()
    expect(doc.openapi).toMatch(/^3\.1/)
    expect(Object.keys(doc.paths).some(p => p.includes('sign-in'))).toBe(true)
  })
})
