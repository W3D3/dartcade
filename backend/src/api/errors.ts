import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

// Extra detail ajv puts on additionalProperties errors
const ParamsSchema = z.object({ additionalProperty: z.string() })

/** All errors leave as ErrorResponse: { error, details? } (schema/common-v1.json). */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err.validation) {
      return reply.code(400).send({
        error: 'invalid request',
        details: err.validation.map(v => {
          // params can be missing on errors from a custom validator
          const params = ParamsSchema.safeParse(v.params)
          const extra = params.success ? params.data.additionalProperty : undefined
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
