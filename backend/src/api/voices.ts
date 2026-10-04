import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { readPack, type ParsedPack } from '../caller/pack.js'
import { fetchPack, LinkError } from '../caller/fetchPack.js'
import { ZipError } from '../caller/zip.js'
import { voiceConfig } from '../caller/config.js'
import {
  importPack, listPacks, packManifest, clipFor, deletePack, usage, withImportLock, VoiceLimitError, VoiceBusyError,
  type PackSource,
} from '../caller/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Per-user storage limit; from VOICE_STORAGE_LIMIT_MB unless given (tests). */
  limitBytes?: number
  /** Fetches link imports; the global fetch unless given (tests). */
  fetchImpl?: typeof fetch
}

/** The largest zip accepted (a darts-caller download is about 60 MB). */
const UPLOAD_LIMIT = 128 * 1024 * 1024

export function voicesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, limitBytes = voiceConfig().limitBytes, fetchImpl = fetch } = opts

  /** Reads and stores a pack under the user's import lock; the reply says how many files the source had. */
  const runImport = (userId: string, read: () => Promise<ParsedPack>, source: PackSource) => withImportLock(userId, async () => {
    const parsed = await read()
    return { ...await importPack(db, userId, parsed, source, limitBytes), total: parsed.total }
  })
  /** The import errors as responses; anything else is rethrown. */
  function importError(err: unknown): { status: 400 | 413 | 429; error: string } {
    if (err instanceof ZipError || err instanceof LinkError) return { status: 400, error: err.message }
    if (err instanceof VoiceLimitError) return { status: 413, error: err.message }
    if (err instanceof VoiceBusyError) return { status: 429, error: err.message }
    throw err
  }

  app.get<Route<'listVoicePacks'>>('/api/voice-packs', { preValidation: requireAuth, schema: fromSpec('listVoicePacks') }, async (req) => {
    const [packs, bytes] = await Promise.all([listPacks(db, req.userId), usage(db, req.userId)])
    return { packs, usage: { bytes, limitBytes } }
  })

  // Uploads in a scope of their own that takes zips only (as one Buffer); other bodies get a 415
  app.register((scope, _opts, registered) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('application/zip', { parseAs: 'buffer', bodyLimit: UPLOAD_LIMIT }, (_req, body, parsed) => { parsed(null, body) })

    scope.post<Route<'uploadVoicePack'>>('/api/voice-packs', {
      preValidation: requireAuth, schema: fromSpec('uploadVoicePack'), bodyLimit: UPLOAD_LIMIT,
    }, async (req, reply) => {
      if (limitBytes === 0) return reply.code(413).send({ error: new VoiceLimitError(0, 0).message })
      try {
        // A copy, so a request without a body (undefined) reads as an empty file: not a zip
        const pack = await runImport(req.userId, () => readPack(new Uint8Array(req.body), req.query.name), { kind: 'upload' })
        return await reply.code(201).send(pack)
      } catch (err) {
        const { status, error } = importError(err)
        return reply.code(status).send({ error })
      }
    })
    registered()
  })

  // A few per minute: each one makes the server download up to 128 MB
  app.post<Route<'importVoicePack'>>('/api/voice-packs/import', {
    preValidation: requireAuth, schema: fromSpec('importVoicePack'), config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (limitBytes === 0) return reply.code(413).send({ error: new VoiceLimitError(0, 0).message })
    const { url } = req.body
    try {
      const pack = await runImport(req.userId, () => fetchPack(url, fetchImpl), { kind: 'url', url })
      return await reply.code(201).send(pack)
    } catch (err) {
      const { status, error } = importError(err)
      return reply.code(status).send({ error })
    }
  })

  app.get<Route<'getVoicePack'>>('/api/voice-packs/:id', { preValidation: requireAuth, schema: fromSpec('getVoicePack') }, async (req, reply) => {
    const manifest = await packManifest(db, req.userId, req.params.id)
    if (!manifest) return reply.code(404).send({ error: 'not found' })
    return reply.send(manifest)
  })

  app.delete<Route<'deleteVoicePack'>>('/api/voice-packs/:id', { preValidation: requireAuth, schema: fromSpec('deleteVoicePack') }, async (req, reply) => {
    if (!await deletePack(db, req.userId, req.params.id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  // Out of the rate limit: a pack's clips (a few hundred) are fetched as they're needed
  app.get<Route<'getVoiceClip'>>('/api/voice-clips/:sha256', {
    preValidation: requireAuth, schema: fromSpec('getVoiceClip'), config: { rateLimit: false },
  }, async (req, reply) => {
    const clip = await clipFor(db, req.userId, req.params.sha256)
    if (!clip) return reply.code(404).send({ error: 'not found' })
    reply.header('content-type', clip.mime)
    // A hash names one content for good; private: only this user may fetch it
    reply.header('cache-control', 'private, max-age=31536000, immutable')
    return reply.send(clip.bytes)
  })

  done()
}
