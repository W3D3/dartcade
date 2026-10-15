import Fastify, { errorCodes, type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './errors.js'
import { registerResponseValidation } from './responseValidation.js'

/** A Fastify instance with the API's validation rules; used by buildApp() and route tests. */
export function createFastify(): FastifyInstance {
  // Fastify's default Ajv options strip unknown request fields (removeAdditional): newer
  // clients keep working, and handlers only see fields from the spec
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  registerErrorHandler(app)
  // A POST without a body (create a lobby, close it, …) can still arrive looking like one: with a
  // content type Fastify has no parser for, or as an empty chunked body without any type, which a
  // proxy in front of a deployment most likely does. Fastify answers both with 415. This parser
  // takes every type nothing else claims and accepts only an empty body, so real bodies of an
  // unknown type are still refused.
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    if (body.length === 0) done(null, undefined)
    else done(new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE(req.headers['content-type'] ?? ''), undefined)
  })
  if (process.env.NODE_ENV !== 'production') registerResponseValidation(app)
  return app
}
