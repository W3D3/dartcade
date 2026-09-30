import type { FastifySchema } from 'fastify'
import spec from '../schema/api-v1.deref.json' with { type: 'json' }

type JsonSchema = Record<string, unknown>
type Parameter = { name: string; in: 'path' | 'query' | 'header' | 'cookie'; required?: boolean; schema: JsonSchema }
type MediaTypes = Record<string, { schema: JsonSchema }>
export type Operation = {
  operationId: string
  summary?: string
  tags?: string[]
  parameters?: Parameter[]
  requestBody?: { required?: boolean; content: MediaTypes }
  responses: Record<string, { description: string; content?: MediaTypes }>
}
type PathItem = Partial<Record<(typeof METHODS)[number], Operation>> & { parameters?: Parameter[] }

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** Every operation in schema/api-v1.yaml, with Fastify-style paths ({id} → :id). */
export const specRoutes = Object.entries(spec.paths as unknown as Record<string, PathItem>).flatMap(([path, item]) =>
  METHODS.flatMap(method => {
    const op = item[method]
    if (!op) return []
    // Path-level parameters apply to every operation of the path
    const operation: Operation = { ...op, parameters: [...(item.parameters ?? []), ...(op.parameters ?? [])] }
    return [{ method: method.toUpperCase(), path: path.replace(/\{(\w+)\}/g, ':$1'), operation }]
  }),
)

const byId = new Map(specRoutes.map(r => [r.operation.operationId, r.operation]))

export function getOperation(operationId: string): Operation {
  const op = byId.get(operationId)
  if (!op) throw new Error(`unknown operationId in schema/api-v1.yaml: ${operationId}`)
  return op
}

function paramsSchema(params: Parameter[], location: 'path' | 'query'): JsonSchema | undefined {
  const ps = params.filter(p => p.in === location)
  if (!ps.length) return undefined
  return {
    type: 'object',
    properties: Object.fromEntries(ps.map(p => [p.name, p.schema])),
    required: ps.filter(p => p.required).map(p => p.name),
    // Extra query params (e.g. cache-busters like ?t=) are tolerated
    additionalProperties: location === 'query',
  }
}

/** Fastify route schema (params, querystring, body, JSON responses) for an operation of the spec. */
export function fromSpec(
  operationId: string,
): FastifySchema & { operationId: string; summary?: string; tags?: string[] } {
  const op = getOperation(operationId)
  const params = op.parameters ?? []
  const path = paramsSchema(params, 'path')
  const query = paramsSchema(params, 'query')
  const body = op.requestBody?.content['application/json']?.schema
  const response = Object.fromEntries(Object.entries(op.responses).flatMap(([status, res]) => {
    const json = res.content?.['application/json']?.schema
    return json ? [[status, json]] : []   // 204 and image/jpeg have no JSON schema
  }))
  return {
    operationId,
    summary: op.summary,
    tags: op.tags,
    ...(path && { params: path }),
    ...(query && { querystring: query }),
    ...(body && { body }),
    response,
  }
}
