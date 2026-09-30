import { describe, it, expect, vi } from 'vitest'
import { createApi } from '../api/client'

const json = (status: number, body: unknown) =>
  async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  it('returns typed data on success', async () => {
    const api = createApi({ baseUrl: 'http://test', fetch: json(200, { boards: [] }) })
    const { data } = await api.GET('/api/boards')
    expect(data).toEqual({ boards: [] })
  })

  it('sends signed-out users to the login page on 401', async () => {
    const onUnauthorized = vi.fn()
    const api = createApi({ baseUrl: 'http://test', fetch: json(401, { error: 'unauthorized' }), onUnauthorized })
    const { error, response } = await api.GET('/api/boards')
    expect(response.status).toBe(401)
    expect(error).toEqual({ error: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('does not redirect on other errors', async () => {
    const onUnauthorized = vi.fn()
    const api = createApi({ baseUrl: 'http://test', fetch: json(409, { error: 'x', sessionId: 's1' }), onUnauthorized })
    const { error } = await api.POST('/api/sessions', { body: { gameId: 'atc', config: {}, players: [{ name: 'A' }] } })
    expect(error).toEqual({ error: 'x', sessionId: 's1' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
