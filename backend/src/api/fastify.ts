import Fastify, { type FastifyInstance } from 'fastify'
import { registerErrorHandler } from './errors.js'
import { registerResponseValidation } from './responseValidation.js'

/** A Fastify instance with the API's validation rules; used by buildApp() and route tests. */
export function createFastify(): FastifyInstance {
  // Fastify's default Ajv options strip unknown request fields (removeAdditional): newer
  // clients keep working, and handlers only see fields from the spec
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  registerErrorHandler(app)
  if (process.env.NODE_ENV !== 'production') registerResponseValidation(app)
  return app
}
