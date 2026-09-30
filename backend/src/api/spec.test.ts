import { describe, it, expect } from 'vitest'
import type { RouteOptions } from 'fastify'
import { buildApp } from '../app.js'
import { specRoutes } from './spec.js'

// Owned elsewhere: better-auth, Swagger UI; WebSockets aren't HTTP operations
const EXCLUDED = [/^\/api\/auth\//, /^\/api\/docs/]

async function registeredRoutes() {
  const routes: { method: string; path: string; operationId?: string }[] = []
  const app = await buildApp({
    engine: {} as any,
    db: {} as any,
    onRoute: (r: RouteOptions) => {
      for (const method of ([] as string[]).concat(r.method)) {
        if (method === 'HEAD') continue   // auto-added for every GET
        routes.push({ method, path: r.url, operationId: (r.schema as { operationId?: string } | undefined)?.operationId })
      }
    },
  })
  await app.ready()
  await app.close()
  return routes.filter(r => (r.path.startsWith('/api/') || r.path === '/health') && !EXCLUDED.some(x => x.test(r.path)))
}

const key = (r: { method: string; path: string }) => `${r.method} ${r.path}`

describe('schema/api-v1.yaml', () => {
  it('describes exactly the registered routes (both ways)', async () => {
    const registered = (await registeredRoutes()).map(key).sort()
    expect(registered).toEqual(specRoutes.map(key).sort())
  })
})
