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
    lobbies: {} as any,
    onRoute: (r: RouteOptions) => {
      for (const method of ([] as string[]).concat(r.method)) {
        if (method === 'HEAD') continue   // auto-added for every GET
        routes.push({ method, path: r.url, operationId: (r.schema)?.operationId })
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

  it('attaches each operation\'s schema to its route', async () => {
    const byKey = new Map(specRoutes.map(r => [key(r), r.operation.operationId]))
    const missing = (await registeredRoutes())
      .filter(r => r.operationId !== byKey.get(key(r)))
      .map(r => `${key(r)} has ${r.operationId ?? 'no schema'}, expected ${byKey.get(key(r))}`)
    expect(missing).toEqual([])
  })
})
