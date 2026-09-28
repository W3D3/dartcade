import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { pairingApiPlugin } from './pairing.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: async (req: any, _reply: any) => { req.userId = 'user-1' },
}))

vi.mock('../db/queries.js', () => ({
  insertPairingCode: vi.fn().mockResolvedValue(undefined),
  getPairingCode: vi.fn().mockResolvedValue(undefined),
  claimPairingCode: vi.fn().mockResolvedValue(undefined),
  consumePairingToken: vi.fn().mockResolvedValue(undefined),
  insertBoard: vi.fn().mockResolvedValue(undefined),
}))

import * as queries from '../db/queries.js'

beforeEach(() => vi.clearAllMocks())

function makeApp() {
  const app = Fastify()
  app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  const mockDb: any = {
    transaction: () => ({ execute: (fn: (trx: any) => Promise<any>) => fn(mockDb) }),
  }
  app.register(pairingApiPlugin, { db: mockDb })
  return app
}

// ---- POST /api/pairing/request ----

describe('POST /api/pairing/request', () => {
  it('returns 201 with an 8-char uppercase code and expiresAt', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/pairing/request' })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect(typeof body.expiresAt).toBe('string')
    expect(queries.insertPairingCode).toHaveBeenCalledOnce()
  })
})

// ---- GET /api/pairing/:code/token ----

describe('GET /api/pairing/:code/token', () => {
  it('returns 404 when code not found', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when code is expired', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() - 1000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(404)
  })

  it('returns pending when code exists and not yet claimed', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('pending')
    expect(queries.consumePairingToken).not.toHaveBeenCalled()
  })

  it('returns claimed+token from the atomic consume on first delivery', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: 'stale-read', // GET must NOT trust this; it uses the consume result
      board_id: 'board-1',
      created_at: new Date() as any,
    })
    // The token comes from the atomic consume, not the earlier read.
    vi.mocked(queries.consumePairingToken).mockResolvedValueOnce('secret-abc')
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('claimed')
    expect(body.token).toBe('secret-abc')
    expect(queries.consumePairingToken).toHaveBeenCalledWith(expect.anything(), 'ABCD1234')
  })

  it('returns consumed when the atomic consume finds no token (already delivered)', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: null,
      board_id: 'board-1',
      created_at: new Date() as any,
    })
    vi.mocked(queries.consumePairingToken).mockResolvedValueOnce(null)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('consumed')
  })

  it('delivers the token for a claimed code even after it expired', async () => {
    // Claimed just before the TTL, polled just after — the token must still
    // be delivered, not 404'd, or the bridge loops forever.
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() - 1000),
      claimed_at: new Date(Date.now() - 500),
      raw_token: 'tok-late',
      board_id: 'board-1',
      created_at: new Date() as any,
    })
    vi.mocked(queries.consumePairingToken).mockResolvedValueOnce('tok-late')
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('claimed')
    expect(body.token).toBe('tok-late')
  })
})

// ---- POST /api/pairing/claim ----

describe('POST /api/pairing/claim', () => {
  it('returns 400 when code or name is missing', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { name: 'Living Room' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when code does not exist', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue(undefined)
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 410 when code is expired', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() - 1000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(410)
  })

  it('returns 409 when code is already claimed', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: 'tok',
      board_id: 'b1',
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 201 with boardId and name on success', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Living Room' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(typeof body.boardId).toBe('string')
    expect(body.name).toBe('Living Room')
    expect(queries.insertBoard).toHaveBeenCalledOnce()
    expect(queries.claimPairingCode).toHaveBeenCalledOnce()
  })

  it('returns 409 when concurrent claim beats this request', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    vi.mocked(queries.claimPairingCode).mockRejectedValueOnce(new Error('pairing code already claimed'))
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('accepts lowercase code by uppercasing it', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'abcd1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(201)
    expect(queries.getPairingCode).toHaveBeenCalledWith(expect.anything(), 'ABCD1234')
  })

  it('normalizes a dashed/spaced code by stripping separators', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: '7KQ4M2XD',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: ' 7kq4-m2xd ', name: 'Board' },
    })
    expect(res.statusCode).toBe(201)
    expect(queries.getPairingCode).toHaveBeenCalledWith(expect.anything(), '7KQ4M2XD')
  })
})
