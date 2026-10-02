import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { fromSpec } from './spec.js'
import { ApiError } from './errors.js'

// The handler echoes the body keys it received (in `token`) so tests can see what reached it
function app() {
  const a = createFastify()
  a.post('/api/boards', { schema: fromSpec('createBoard') }, async (req, reply) =>
    reply.code(201).send({ id: 'b1', name: 'Home', token: Object.keys(req.body as object).join(',') }))
  return a
}

describe('request validation and error format', () => {
  it('accepts unknown fields from newer clients but strips them before the handler', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/boards', payload: { name: 'Home', color: 'lime' } })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).token).toBe('name')
  })

  it('rejects a missing required field with 400 and details', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/boards', payload: {} })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toBe('invalid request')
    expect(body.details[0].path).toBe('body')
    expect(body.details[0].message).toMatch(/required property 'name'/)
  })

  it('rejects a whitespace-only name', async () => {
    const res = await app().inject({ method: 'POST', url: '/api/boards', payload: { name: '   ' } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).details[0].path).toBe('body/name')
  })

  it('maps thrown errors to { error } with their status, and hides 500 messages', async () => {
    const a = createFastify()
    a.get('/boom', () => { throw Object.assign(new Error('secret db detail'), { statusCode: 500 }) })
    a.get('/teapot', () => { throw Object.assign(new Error('short and stout'), { statusCode: 418 }) })
    expect(JSON.parse((await a.inject('/boom')).body)).toEqual({ error: 'internal error' })
    const tea = await a.inject('/teapot')
    expect(tea.statusCode).toBe(418)
    expect(JSON.parse(tea.body)).toEqual({ error: 'short and stout' })
  })
})

describe('ApiError', () => {
  it('answers with its status and body', async () => {
    const a = createFastify()
    a.get('/boom', () => { throw new ApiError(409, { error: 'taken', code: 'in_lobby' } as { error: string }) })
    const res = await a.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'taken', code: 'in_lobby' })
  })
})
