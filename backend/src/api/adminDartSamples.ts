// The admin Dart samples page: training data for the dart detection model, its totals, a look at
// each sample's stills, and the download (schema/api-v1.yaml, tag admin).
// Design: docs/superpowers/specs/2026-10-31-dart-detection-model-design.md
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import { pack } from 'tar-stream'
import type { Database } from '../db/schema.js'
import { requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import {
  exportSamples,
  listSamples,
  newestSettledId,
  sampleStill,
  sampleStills,
  sampleTotals,
  type LabelledSample,
} from '../db/dartSamples.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** DART_SAMPLES_MAX_GB in bytes; 0 when collection is off. */
  maxBytes: number
  now?: () => number
}

const PAGE = 50
/** Samples read per query while a download streams. */
const BATCH = 50
/** A dart is downloaded once its visit can no longer be corrected (Undo reopens only the last one). */
const SETTLE_MS = 60 * 60 * 1000

const toJson = (s: LabelledSample) => ({ ...s, capturedAt: s.capturedAt.toISOString() })

export function adminDartSamplesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, maxBytes, now = Date.now } = opts
  const settledBefore = () => new Date(now() - SETTLE_MS)

  app.get<Route<'listAdminDartSamples'>>(
    '/api/admin/dart-samples',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('listAdminDartSamples') },
    async req => {
      const [totals, settledNewestId, samples] = await Promise.all([
        sampleTotals(db),
        newestSettledId(db, settledBefore()),
        listSamples(db, { beforeId: req.query.before, label: req.query.label, limit: PAGE }),
      ])
      return {
        totals: { ...totals, maxBytes, newest: totals.newest?.toISOString() ?? null },
        settledNewestId,
        samples: samples.map(toJson),
      }
    },
  )

  app.get<Route<'getAdminDartSampleStill'>>(
    '/api/admin/dart-samples/:id/stills/:phase/:cam',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('getAdminDartSampleStill') },
    async (req, reply) => {
      const { id, phase, cam } = req.params
      const jpeg = await sampleStill(db, id, phase, cam)
      if (!jpeg) return reply.code(404).send({ error: 'not found' })
      reply.header('content-type', 'image/jpeg')
      // A sample's stills never change
      reply.header('cache-control', 'private, max-age=31536000, immutable')
      return reply.send(jpeg)
    },
  )

  // The reply is a stream, which the spec's binary body (typed as a Buffer) doesn't cover
  app.get<Omit<Route<'exportAdminDartSamples'>, 'Reply'>>(
    '/api/admin/dart-samples/export',
    { preValidation: [requireAuth, requireAdmin], schema: fromSpec('exportAdminDartSamples') },
    (req, reply) => {
      const { after, upTo, label } = req.query
      const tar = pack()
      const until = settledBefore()
      // Each entry resolves once the reader has taken it, so a big download never sits in memory
      const entry = (name: string, body: Buffer) =>
        new Promise<void>((resolve, reject) => {
          tar.entry({ name }, body, err => {
            if (err) reject(err)
            else resolve()
          })
        })
      const write = async () => {
        const labels: string[] = []
        let cursor = after
        for (;;) {
          const batch = await exportSamples(db, { afterId: cursor, upToId: upTo, label, limit: BATCH, settledBefore: until })
          if (batch.length === 0) break
          for (const st of await sampleStills(
            db,
            batch.map(s => s.id),
          ))
            await entry(`${st.sample_id}/${st.phase}-${st.cam}.jpg`, st.jpeg)
          labels.push(...batch.map(s => JSON.stringify(toJson(s))))
          cursor = batch[batch.length - 1]?.id
        }
        await entry('labels.jsonl', Buffer.from(labels.map(l => `${l}\n`).join('')))
        tar.finalize()
      }
      write().catch((err: unknown) => {
        req.log.error({ err }, 'dart sample download failed')
        tar.destroy(err instanceof Error ? err : new Error(String(err)))
      })
      const name = `dart-samples-${after ?? '0'}-${upTo}${label ? `-${label}` : ''}.tar`
      reply.header('content-type', 'application/x-tar')
      reply.header('content-disposition', `attachment; filename="${name}"`)
      return reply.send(tar)
    },
  )

  done()
}
