import type { operations } from '../schema/api.js'

// A JSON body as its schema's type; any other media type (image/jpeg, audio/*, application/zip)
// is declared in the spec as a binary string and handled as a Buffer
type Body<T> = T extends { content: infer C }
  ? 'application/json' extends keyof C ? C['application/json'] : Buffer
  : never
// openapi-typescript marks absent parts as `never`/optional-never; Fastify wants `unknown` there
type Defined<T> = [T] extends [never] ? unknown : [T] extends [undefined] ? unknown : T
type Responses<K extends keyof operations> = operations[K]['responses']

/**
 * Fastify route generic for an operation of schema/api-v1.yaml, e.g.
 * `app.post<Route<'createSession'>>(...)` types req.body, req.params and reply.send().
 */
export type Route<K extends keyof operations> = {
  Params: Defined<NonNullable<operations[K]['parameters']['path']>>
  Querystring: Defined<NonNullable<operations[K]['parameters']['query']>>
  Body: Defined<Body<NonNullable<operations[K]['requestBody']>>>
  Reply: { [S in keyof Responses<K>]: Body<Responses<K>[S]> }[keyof Responses<K>]
}
