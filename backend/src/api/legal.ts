import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'
import type { loadLegal } from '../legal/load.js'

export type LegalDocs = Awaited<ReturnType<typeof loadLegal>>

export function legalApiPlugin(app: FastifyInstance, opts: FastifyPluginOptions & { docs: LegalDocs }, done: (err?: Error) => void): void {
  app.get<Route<'getLegalDoc'>>('/api/legal/:doc', { schema: fromSpec('getLegalDoc') }, req => {
    const doc = opts.docs[req.params.doc]
    return { html: doc.html, updated: doc.updated }
  })
  done()
}
