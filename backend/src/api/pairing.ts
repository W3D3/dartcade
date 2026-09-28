import { createHash, randomBytes } from 'crypto'
import { ulid } from 'ulid'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import {
  insertPairingCode,
  getPairingCode,
  claimPairingCode,
  consumePairingToken,
  insertBoard,
} from '../db/queries.js'

const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 10 * 60 * 1000

function generateCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, b => CODE_CHARSET[b % CODE_CHARSET.length]).join('')
}

// Uppercase and strip separators (dashes, spaces) so a code entered as
// "7kq4-m2xd" or pasted with surrounding whitespace resolves to "7KQ4M2XD".
function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

export async function pairingApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts

  app.post('/api/pairing/request', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (_req, reply) => {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)
    await insertPairingCode(db, { code, expiresAt })
    return reply.code(201).send({ code, expiresAt: expiresAt.toISOString() })
  })

  app.get('/api/pairing/:code/token', {
    // A paired bridge polls this every 2s (~30/min), so the cap has to sit
    // above that. Brute-forcing is still futile: the code space is 32^8 and
    // the token is consumed on first delivery.
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { code } = req.params as { code: string }
    const row = await getPairingCode(db, normalizeCode(code))

    if (!row || row.expires_at < new Date()) {
      return reply.code(404).send({ error: 'not found' })
    }
    if (!row.claimed_at) {
      return reply.send({ status: 'pending' })
    }
    if (!row.raw_token) {
      return reply.send({ status: 'consumed' })
    }
    await consumePairingToken(db, row.code)
    return reply.send({ status: 'claimed', token: row.raw_token })
  })

  app.post('/api/pairing/claim', { preHandler: requireAuth }, async (req, reply) => {
    const { code, name } = req.body as { code?: string; name?: string }
    if (!code?.trim() || !name?.trim()) {
      return reply.code(400).send({ error: 'code and name required' })
    }
    const row = await getPairingCode(db, normalizeCode(code))
    if (!row) return reply.code(404).send({ error: 'not found' })
    if (row.expires_at < new Date()) return reply.code(410).send({ error: 'expired' })
    if (row.claimed_at) return reply.code(409).send({ error: 'already claimed' })

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const boardId = ulid()

    try {
      await db.transaction().execute(async (trx) => {
        await insertBoard(trx, { id: boardId, owner_user_id: req.userId, name: name.trim(), token_hash: tokenHash })
        await claimPairingCode(trx, { code: row.code, rawToken, boardId })
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'pairing code already claimed') {
        return reply.code(409).send({ error: 'already claimed' })
      }
      throw err
    }

    return reply.code(201).send({ boardId, name: name.trim() })
  })
}
