import { Ajv, type ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'
import type { FastifyInstance } from 'fastify'
import { getOperation, type Operation } from './spec.js'

// ajv-formats is CommonJS: under NodeNext, TypeScript types its default import as the
// module object, whose `default` is the plugin (at runtime module.exports.default is the
// plugin itself too).
const addFormats = addFormatsModule.default

/**
 * Dev/test safety net: checks each response of a spec'd route against schema/api-v1.yaml
 * and turns a mismatch into a 500, so handler/spec drift fails tests instead of shipping.
 * Server errors (5xx) and responses without a JSON schema (204, image/jpeg) pass through.
 */
export function registerResponseValidation(app: FastifyInstance): void {
  const ajv = new Ajv({ strict: false, allErrors: true })
  addFormats(ajv)
  const validators = new Map<string, ValidateFunction>()

  app.addHook('onSend', async (req, reply, payload) => {
    const operationId = req.routeOptions.schema?.operationId
    if (!operationId || reply.statusCode >= 500) return payload

    const fail = (message: string) => {
      req.log.error({ operationId }, `response does not match the API spec: ${message}`)
      reply.code(500).header('content-type', 'application/json; charset=utf-8')
      return JSON.stringify({ error: 'response does not match the API spec', details: [{ path: operationId, message }] })
    }

    const status = String(reply.statusCode)
    const responses: Partial<Operation['responses']> = getOperation(operationId).responses
    const response = responses[status]
    if (!response) return fail(`undocumented status ${status}`)
    const schema = response.content?.['application/json']?.schema
    if (!schema || typeof payload !== 'string') return payload

    const key = `${operationId} ${status}`
    let validate = validators.get(key)
    if (!validate) { validate = ajv.compile(schema); validators.set(key, validate) }
    return validate(JSON.parse(payload)) ? payload : fail(ajv.errorsText(validate.errors))
  })
}
