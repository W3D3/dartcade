import type { FastifyInstance } from 'fastify'

/** All errors leave as ErrorResponse: { error, details? } (schema/common-v1.json). */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        error: 'invalid request',
        details: err.validation.map(v => {
          const extra = (v.params as { additionalProperty?: string } | undefined)?.additionalProperty
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
