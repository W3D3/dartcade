import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { readPack, type ParsedPack } from '../caller/pack.js'
import { fetchPack, LinkError } from '../caller/fetchPack.js'
import { ZipError } from '../caller/zip.js'
import { voiceConfig } from '../caller/config.js'
import {
  importPack,
  listPacks,
  packManifest,
  clipFor,
  deletePack,
  usage,
  reserveImport,
  VoiceLimitError,
  VoiceBusyError,
  type ImportSlot,
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
  /** The largest zip accepted; UPLOAD_LIMIT unless given (tests). */
  uploadLimit?: number
}

/** The largest zip accepted (a darts-caller download is about 60 MB). */
const UPLOAD_LIMIT = 128 * 1024 * 1024

/** Fastify leaves the body undefined for a request without one: that reads as an empty file (not a zip). */
const orEmpty = (body: Uint8Array | undefined): Uint8Array => body ?? new Uint8Array(0)

export function voicesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, limitBytes = voiceConfig().limitBytes, fetchImpl = fetch, uploadLimit = UPLOAD_LIMIT } = opts

  // The import slot each import request holds: taken in onRequest, before Fastify reads (up to
  // uploadLimit of) the body, so a body is only received while its import may run
  const slots = new WeakMap<FastifyRequest, ImportSlot>()
  // Requests whose handler is importing: the handler frees their slot when it's done
  const importing = new WeakSet<FastifyRequest>()
  const free = (req: FastifyRequest) => {
    slots.get(req)?.release()
    slots.delete(req)
  }

  /**
   * Import routes refuse at once when imports are off, or while the user's import (or as many as
   * the server takes) runs, before a body is read; otherwise the request takes the user's slot.
   */
  function reserve(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
    if (limitBytes === 0) {
      reply.code(413).send({ error: new VoiceLimitError(0, 0).message })
      return
    }
    try {
      slots.set(req, reserveImport(req.userId))
    } catch (err) {
      if (!(err instanceof VoiceBusyError)) throw err
      reply.code(429).send({ error: err.message })
      return
    }
    done()
  }
  /** Frees the slot of a request that ends (answered, failed or dropped) without importing. */
  function freeUnlessImporting(req: FastifyRequest, _reply: unknown, done: HookHandlerDoneFunction): void {
    if (!importing.has(req)) free(req)
    done()
  }
  // A new object per route: plugins (rate limit) add their own hooks to it. A few per minute: each
  // one makes the server hold up to 128 MB
  const importHooks = () => ({
    onRequest: [requireAuth, reserve],
    onResponse: freeUnlessImporting,
    onError: (req: FastifyRequest, reply: FastifyReply, _err: Error, done: HookHandlerDoneFunction) => {
      freeUnlessImporting(req, reply, done)
    },
    onRequestAbort: (req: FastifyRequest, done: HookHandlerDoneFunction) => {
      freeUnlessImporting(req, null, done)
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  })

  /** Reads and stores a pack in the request's slot; the reply says how many files the source had. */
  async function runImport(req: FastifyRequest, read: () => Promise<ParsedPack>, source: PackSource) {
    if (!slots.has(req)) throw new Error('import without a slot')
    importing.add(req)
    try {
      const parsed = await read()
      return { ...(await importPack(db, req.userId, parsed, source, limitBytes)), total: parsed.total }
    } finally {
      importing.delete(req)
      free(req)
    }
  }
  /** The import errors as responses; anything else is rethrown. */
  function importError(err: unknown): { status: 400 | 413 | 429; error: string } {
    if (err instanceof ZipError || err instanceof LinkError) return { status: 400, error: err.message }
    if (err instanceof VoiceLimitError) return { status: 413, error: err.message }
    if (err instanceof VoiceBusyError) return { status: 429, error: err.message }
    throw err
  }

  app.get<Route<'listVoicePacks'>>('/api/voice-packs', { preValidation: requireAuth, schema: fromSpec('listVoicePacks') }, async req => {
    const [packs, bytes] = await Promise.all([listPacks(db, req.userId), usage(db, req.userId)])
    return { packs, usage: { bytes, limitBytes } }
  })

  // Uploads in a scope of their own that takes zips only (as one Buffer); other bodies get a 415
  app.register((scope, _opts, registered) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('application/zip', { parseAs: 'buffer', bodyLimit: uploadLimit }, (_req, body, parsed) => {
      parsed(null, body)
    })

    scope.post<Route<'uploadVoicePack'>>(
      '/api/voice-packs',
      {
        ...importHooks(),
        schema: fromSpec('uploadVoicePack'),
        bodyLimit: uploadLimit,
      },
      async (req, reply) => {
        try {
          const pack = await runImport(req, () => readPack(orEmpty(req.body), req.query.name), { kind: 'upload' })
          return await reply.code(201).send(pack)
        } catch (err) {
          const { status, error } = importError(err)
          return reply.code(status).send({ error })
        }
      },
    )
    registered()
  })

  app.post<Route<'importVoicePack'>>(
    '/api/voice-packs/import',
    {
      ...importHooks(),
      schema: fromSpec('importVoicePack'),
    },
    async (req, reply) => {
      const { url } = req.body
      try {
        const pack = await runImport(req, () => fetchPack(url, fetchImpl), { kind: 'url', url })
        return await reply.code(201).send(pack)
      } catch (err) {
        const { status, error } = importError(err)
        return reply.code(status).send({ error })
      }
    },
  )

  app.get<Route<'getVoicePack'>>(
    '/api/voice-packs/:id',
    { preValidation: requireAuth, schema: fromSpec('getVoicePack') },
    async (req, reply) => {
      const manifest = await packManifest(db, req.userId, req.params.id)
      if (!manifest) return reply.code(404).send({ error: 'not found' })
      return reply.send(manifest)
    },
  )

  app.delete<Route<'deleteVoicePack'>>(
    '/api/voice-packs/:id',
    { preValidation: requireAuth, schema: fromSpec('deleteVoicePack') },
    async (req, reply) => {
      if (!(await deletePack(db, req.userId, req.params.id))) return reply.code(404).send({ error: 'not found' })
      return reply.code(204).send()
    },
  )

  // Out of the rate limit: a pack's clips (a few hundred) are fetched as they're needed
  app.get<Route<'getVoiceClip'>>(
    '/api/voice-clips/:sha256',
    {
      preValidation: requireAuth,
      schema: fromSpec('getVoiceClip'),
      config: { rateLimit: false },
    },
    async (req, reply) => {
      const clip = await clipFor(db, req.userId, req.params.sha256)
      if (!clip) return reply.code(404).send({ error: 'not found' })
      reply.header('content-type', clip.mime)
      // A hash names one content for good; private: only this user may fetch it
      reply.header('cache-control', 'private, max-age=31536000, immutable')
      return reply.send(clip.bytes)
    },
  )

  done()
}
