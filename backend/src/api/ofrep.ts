// The OpenFeature Remote Evaluation Protocol (OFREP v1) for the SPA's OFREP web provider. No OFREP
// server library exists for Fastify, so this serves the two routes the web provider uses. The context
// a browser sends is ignored: flags are evaluated for the session's user (anonymous signed out).
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify'
import type { Kysely } from 'kysely'
import { getAuthUser } from '../auth/session.js'
import type { Database } from '../db/schema.js'
import { FLAG_KEYS, evaluateAll, loadFlagUser } from '../flags/index.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

export function ofrepApiPlugin(
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: Kysely<Database> },
  done: (err?: Error) => void,
): void {
  const flagsFor = async (req: FastifyRequest) => evaluateAll(await loadFlagUser(opts.db, (await getAuthUser(req))?.userId ?? null))

  app.post<Route<'ofrepEvaluateFlags'>>('/ofrep/v1/evaluate/flags', { schema: fromSpec('ofrepEvaluateFlags') }, async (req, reply) => {
    const flags = await flagsFor(req)
    // The ETag is the result itself: another user's (different) flags never match it
    const etag = `"${createHash('sha1').update(JSON.stringify(flags)).digest('hex')}"`
    reply.header('ETag', etag)
    if (req.headers['if-none-match'] === etag) return reply.code(304).send()
    return { flags }
  })

  app.post<Route<'ofrepEvaluateFlag'>>('/ofrep/v1/evaluate/flags/:key', { schema: fromSpec('ofrepEvaluateFlag') }, async (req, reply) => {
    const { key } = req.params
    if (!FLAG_KEYS.includes(key)) return reply.code(404).send({ key, errorCode: 'FLAG_NOT_FOUND' })
    const flag = (await flagsFor(req)).find(f => f.key === key)
    return flag ?? reply.code(404).send({ key, errorCode: 'FLAG_NOT_FOUND' })
  })

  done()
}
