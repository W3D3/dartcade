import Fastify, { errorCodes, type FastifyInstance, type FastifyRequest } from 'fastify'
import { registerErrorHandler } from './errors.js'
import { registerResponseValidation } from './responseValidation.js'

/** A Fastify instance with the API's validation rules; used by buildApp() and route tests. */
export function createFastify(): FastifyInstance {
  // Fastify's default Ajv options strip unknown request fields (removeAdditional): newer
  // clients keep working, and handlers only see fields from the spec
  // Behind a reverse proxy every request comes from the proxy: TRUST_PROXY makes rate limits count
  // the client's address from X-Forwarded-For instead (true, a hop count, or the proxy's addresses)
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test' && { serializers: { req: logRequest } },
    trustProxy: trustProxy(process.env.TRUST_PROXY),
  })
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

/** TRUST_PROXY as Fastify takes it: unset is off, "true" trusts every proxy, a number counts hops. */
export function trustProxy(value: string | undefined): boolean | number | string {
  if (!value) return false
  if (value === 'true') return true
  return /^\d+$/.test(value) ? Number(value) : value
}

/** Fastify's request log line without the query: it can carry a secret (an old bridge's token, sign-in links). */
export function logRequest(req: FastifyRequest) {
  return {
    method: req.method,
    url: req.url.split('?')[0],
    hostname: req.hostname,
    remoteAddress: req.ip,
    remotePort: req.socket.remotePort,
  }
}
