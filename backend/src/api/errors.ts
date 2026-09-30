import type { FastifyInstance } from 'fastify'
import { isRecord, isString } from '../guards.js'

/** All errors leave as ErrorResponse: { error, details? } (schema/common-v1.json). */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        error: 'invalid request',
        details: err.validation.map(v => {
          // params can be missing on errors from a custom validator
          const extra = isRecord(v.params) && isString(v.params.additionalProperty) ? v.params.additionalProperty : undefined
          return {
            path: `${err.validationContext ?? 'request'}${v.instancePath}`,
            message: `${v.message ?? 'is invalid'}${extra ? `: ${extra}` : ''}`,
          }
        }),
      })
    }
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
    if (status >= 500) req.log.error(err)
    return reply.code(status).send({ error: status >= 500 ? 'internal error' : err.message })
  })
}
