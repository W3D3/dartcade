import Fastify, { type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './errors.js'
import { registerResponseValidation } from './responseValidation.js'

/** A Fastify instance with the API's validation rules; used by buildApp() and route tests. */
export function createFastify(): FastifyInstance {
  // Fastify's default Ajv options strip unknown request fields (removeAdditional): newer
  // clients keep working, and handlers only see fields from the spec
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  registerErrorHandler(app)
  // A POST without a body (create a lobby, close it, …) can still arrive with a content type: a
  // proxy in front of a deployment added application/octet-stream, which Fastify has no parser
  // for and answered with 415. Without a body there is nothing to parse, so the type is dropped.
  app.addHook('onRequest', (req, _reply, done) => {
    const length = req.headers['content-length']
    if ((length === undefined || length === '0') && req.headers['transfer-encoding'] === undefined) delete req.headers['content-type']
    done()
  })
  if (process.env.NODE_ENV !== 'production') registerResponseValidation(app)
  return app
}
