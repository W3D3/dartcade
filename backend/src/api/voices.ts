import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { readPack } from '../caller/pack.js'
import { ZipError } from '../caller/zip.js'
import { voiceConfig } from '../caller/config.js'
import {
  importPack, listPacks, packManifest, clipFor, deletePack, usage, withImportLock, VoiceLimitError, VoiceBusyError,
} from '../caller/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Per-user storage limit; from VOICE_STORAGE_LIMIT_MB unless given (tests). */
  limitBytes?: number
}

/** The largest zip accepted (a darts-caller download is about 60 MB). */
const UPLOAD_LIMIT = 128 * 1024 * 1024

export function voicesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, limitBytes = voiceConfig().limitBytes } = opts

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
        const pack = await withImportLock(req.userId, async () => {
          // A copy, so a request without a body (undefined) reads as an empty file: not a zip
          const parsed = await readPack(new Uint8Array(req.body), req.query.name)
          return importPack(db, req.userId, parsed, { kind: 'upload' }, limitBytes)
        })
        return await reply.code(201).send(pack)
      } catch (err) {
        if (err instanceof ZipError) return reply.code(400).send({ error: err.message })
        if (err instanceof VoiceLimitError) return reply.code(413).send({ error: err.message })
        if (err instanceof VoiceBusyError) return reply.code(429).send({ error: err.message })
        throw err
      }
    })
    registered()
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

  app.get<Route<'getVoiceClip'>>('/api/voice-clips/:sha256', { preValidation: requireAuth, schema: fromSpec('getVoiceClip') }, async (req, reply) => {
    const clip = await clipFor(db, req.userId, req.params.sha256)
    if (!clip) return reply.code(404).send({ error: 'not found' })
    reply.header('content-type', clip.mime)
    // A hash names one content for good; private: only this user may fetch it
    reply.header('cache-control', 'private, max-age=31536000, immutable')
    return reply.send(clip.bytes)
  })

  done()
}
