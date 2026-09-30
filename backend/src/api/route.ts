import type { operations } from '../schema/api.js'

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never
// openapi-typescript marks absent parts as `never`/optional-never; Fastify wants `unknown` there
type Defined<T> = [T] extends [never] ? unknown : [T] extends [undefined] ? unknown : T
type Responses<K extends keyof operations> = operations[K]['responses']

/**
 * Fastify route generic for an operation of schema/api-v1.yaml, e.g.
 * `app.post<Route<'createSession'>>(...)` types req.body, req.params and reply.send().
 * 429 is left out of Reply: it's the rate limiter's free-form body, which would accept anything.
 */
export type Route<K extends keyof operations> = {
  Params: Defined<NonNullable<operations[K]['parameters']['path']>>
  Querystring: Defined<NonNullable<operations[K]['parameters']['query']>>
  Body: Defined<Json<NonNullable<operations[K]['requestBody']>>>
  Reply: { [S in Exclude<keyof Responses<K>, 429>]: Json<Responses<K>[S]> }[Exclude<keyof Responses<K>, 429>]
}
