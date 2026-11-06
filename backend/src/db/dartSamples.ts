// Training data for the dart detection model: one sample per camera dart (migration 057).
// A sample's label is never copied: it is joined from the game's final dart, so a correction made
// later in the visit, or an Undo, is in it. A camera dart's game_darts.thrown_at is the created_at
// of the game input that logged it (session/engine.ts `record`: one `at` for both), and that input
// row names the bridge event, which is the join below.
// Design: docs/superpowers/specs/2026-10-31-dart-detection-model-design.md
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import type { Sample } from '../detection/pairing.js'

/** How much a sample's label can be trusted. */
export type SampleLabel = 'autodarts' | 'corrected_spot' | 'corrected_segment'

const Coords = z.object({ x: z.number(), y: z.number() })
const Dart = z.object({ segment: z.object({ name: z.string() }), coords: Coords.optional() })
const Detected = z.object({ dart: Dart })
const Segment = z.object({ name: z.string() })

type Spot = { segment: string; coords: { x: number; y: number } | null }

export type LabelledSample = {
  id: string
  boardId: string
  bmVersion: string | null
  capturedAt: Date
  /** Where Autodarts put the dart when it was detected. */
  autodarts: Spot
  /** Where it ended up in the game; null when it never reached a committed visit (no game, say). */
  final: (Spot & { corrected: boolean }) | null
  label: SampleLabel
}

/** Stores a sample and its six stills; a dart already kept is skipped. */
export async function insertSample(db: Kysely<Database>, s: Sample): Promise<void> {
  const stills = [
    ...s.before.map((jpeg, cam) => ({ phase: 'before' as const, cam, jpeg })),
    ...s.after.map((jpeg, cam) => ({ phase: 'after' as const, cam, jpeg })),
  ]
  await db.transaction().execute(async trx => {
    const row = await trx
      .insertInto('dart_samples')
      .values({
        board_id: s.boardId,
        bridge_event_id: s.bridgeEventId,
        bm_version: s.bmVersion,
        bytes: stills.reduce((n, st) => n + st.jpeg.length, 0),
      })
      .onConflict(oc => oc.column('bridge_event_id').doNothing())
      .returning('id')
      .executeTakeFirst()
    if (!row) return
    await trx
      .insertInto('dart_sample_stills')
      .values(stills.map(st => ({ sample_id: row.id, ...st })))
      .execute()
  })
}

/** Whether the board's owner lets it share (Settings → Boards); false for a board that is gone. */
export async function boardShares(db: Kysely<Database>, boardId: string): Promise<boolean> {
  const row = await db.selectFrom('boards').select('share_training_images').where('id', '=', boardId).executeTakeFirst()
  return row?.share_training_images ?? false
}

export async function setBoardShares(db: Kysely<Database>, boardId: string, share: boolean): Promise<void> {
  await db.transaction().execute(async trx => {
    await trx.updateTable('boards').set({ share_training_images: share }).where('id', '=', boardId).execute()
    // Turning it off deletes what was kept, as the Privacy text says
    if (!share) await trx.deleteFrom('dart_samples').where('board_id', '=', boardId).execute()
  })
}

// Samples with their game dart (none outside a game), of one label or all, leaving out invalidated games
function labelledQuery(db: Kysely<Database>, label?: SampleLabel) {
  let q = db
    .selectFrom('dart_samples as s')
    .innerJoin('bridge_events as be', 'be.id', 's.bridge_event_id')
    .leftJoin('game_session_events as e', 'e.bridge_event_id', 's.bridge_event_id')
    .leftJoin('game_darts as gd', join =>
      join.onRef('gd.session_id', '=', 'e.session_id').onRef('gd.thrown_at', '=', 'e.created_at').on('gd.source', '=', 'camera'),
    )
    .leftJoin('game_sessions as gs', 'gs.id', 'e.session_id')
    .where('gs.invalidated_at', 'is', null)
    .select(['s.id', 's.board_id', 's.bm_version', 's.captured_at', 'be.data as detected', 'gd.segment', 'gd.coords', 'gd.corrected'])
  if (label === 'autodarts') q = q.where(eb => eb.or([eb('gd.corrected', 'is', null), eb('gd.corrected', '=', false)]))
  if (label === 'corrected_spot') q = q.where('gd.corrected', '=', true).where('gd.coords', 'is not', null)
  if (label === 'corrected_segment') q = q.where('gd.corrected', '=', true).where('gd.coords', 'is', null)
  return q
}

type LabelledRow = {
  id: string
  board_id: string
  bm_version: string | null
  captured_at: Date
  detected: unknown
  segment: unknown
  coords: unknown
  corrected: boolean | null
}

/** A row of the join above as the export and the admin page show it; null if its dart doesn't parse. */
export function toLabelled(r: LabelledRow): LabelledSample | null {
  const detected = Detected.safeParse(r.detected)
  if (!detected.success) return null
  const autodarts = { segment: detected.data.dart.segment.name, coords: detected.data.dart.coords ?? null }
  const segment = Segment.safeParse(r.segment)
  const final = segment.success
    ? { segment: segment.data.name, coords: Coords.nullable().catch(null).parse(r.coords), corrected: r.corrected === true }
    : null
  const label: SampleLabel = !final?.corrected ? 'autodarts' : final.coords ? 'corrected_spot' : 'corrected_segment'
  return { id: r.id, boardId: r.board_id, bmVersion: r.bm_version, capturedAt: r.captured_at, autodarts, final, label }
}

/** Samples newest first, from before `beforeId` (a page's last id), optionally of one label. */
export async function listSamples(
  db: Kysely<Database>,
  opts: { beforeId?: string; label?: SampleLabel; limit: number },
): Promise<LabelledSample[]> {
  let q = labelledQuery(db, opts.label).orderBy('s.id', 'desc')
  if (opts.beforeId) q = q.where('s.id', '<', opts.beforeId)
  const rows = await q.limit(opts.limit).execute()
  return rows.map(toLabelled).filter(s => s !== null)
}

/**
 * Samples for a download, oldest first, after `afterId`. Only those at least `settledMs` old: a dart
 * of a visit still open can still be corrected, and the next download only asks for newer ids.
 */
export async function exportSamples(
  db: Kysely<Database>,
  opts: { afterId?: string; label?: SampleLabel; limit: number; settledBefore: Date },
): Promise<LabelledSample[]> {
  let q = labelledQuery(db, opts.label).where('s.captured_at', '<', opts.settledBefore).orderBy('s.id', 'asc')
  if (opts.afterId) q = q.where('s.id', '>', opts.afterId)
  const rows = await q.limit(opts.limit).execute()
  return rows.map(toLabelled).filter(s => s !== null)
}

/** The six stills of the samples, by sample id. */
export async function sampleStills(
  db: Kysely<Database>,
  ids: string[],
): Promise<{ sample_id: string; phase: 'before' | 'after'; cam: number; jpeg: Buffer }[]> {
  if (ids.length === 0) return []
  return db
    .selectFrom('dart_sample_stills')
    .select(['sample_id', 'phase', 'cam', 'jpeg'])
    .where('sample_id', 'in', ids)
    .orderBy('sample_id')
    .orderBy('phase')
    .orderBy('cam')
    .execute()
}

export async function sampleStill(db: Kysely<Database>, id: string, phase: 'before' | 'after', cam: number): Promise<Buffer | undefined> {
  const row = await db
    .selectFrom('dart_sample_stills')
    .select('jpeg')
    .where('sample_id', '=', id)
    .where('phase', '=', phase)
    .where('cam', '=', cam)
    .executeTakeFirst()
  return row?.jpeg
}

export type SampleTotals = {
  byLabel: Record<SampleLabel, number>
  boards: number
  sharingBoards: number
  bytes: number
  newest: Date | null
}

export async function sampleTotals(db: Kysely<Database>): Promise<SampleTotals> {
  const [labels, size, sharing] = await Promise.all([
    labelledQuery(db)
      .clearSelect()
      .select(eb => [
        eb.fn
          .countAll<string>()
          .filterWhere(w => w.or([w('gd.corrected', 'is', null), w('gd.corrected', '=', false)]))
          .as('autodarts'),
        eb.fn
          .countAll<string>()
          .filterWhere(w => w.and([w('gd.corrected', '=', true), w('gd.coords', 'is not', null)]))
          .as('corrected_spot'),
        eb.fn
          .countAll<string>()
          .filterWhere(w => w.and([w('gd.corrected', '=', true), w('gd.coords', 'is', null)]))
          .as('corrected_segment'),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('dart_samples')
      .select(eb => [
        eb.fn.coalesce(eb.fn.sum<string>('bytes'), sql<string>`0`).as('bytes'),
        eb.fn.max('captured_at').as('newest'),
        eb.fn.count<string>('board_id').distinct().as('boards'),
      ])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('boards')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('share_training_images', '=', true)
      .executeTakeFirstOrThrow(),
  ])
  return {
    byLabel: {
      autodarts: Number(labels.autodarts),
      corrected_spot: Number(labels.corrected_spot),
      corrected_segment: Number(labels.corrected_segment),
    },
    boards: Number(size.boards),
    sharingBoards: Number(sharing.n),
    bytes: Number(size.bytes),
    newest: size.newest,
  }
}

/**
 * Deletes samples until their stills fit in maxBytes: uncorrected ones first, oldest first, so
 * corrected samples (the rare, valuable ones) go only once they alone are over the cap.
 */
export async function pruneSamples(db: Kysely<Database>, maxBytes: number): Promise<number> {
  // The sweep runs every few minutes; the window below is only worth it once over the cap
  const { bytes } = await db
    .selectFrom('dart_samples')
    .select(eb => eb.fn.coalesce(eb.fn.sum<string>('bytes'), sql<string>`0`).as('bytes'))
    .executeTakeFirstOrThrow()
  if (Number(bytes) <= maxBytes) return 0
  const result = await sql<{ id: string }>`
    WITH total AS (SELECT coalesce(sum(bytes), 0) AS bytes FROM dart_samples),
    ranked AS (
      SELECT s.id, s.bytes,
        sum(s.bytes) OVER (ORDER BY coalesce(gd.corrected, false), s.id) AS running
      FROM dart_samples s
      LEFT JOIN game_session_events e ON e.bridge_event_id = s.bridge_event_id
      LEFT JOIN game_darts gd ON gd.session_id = e.session_id AND gd.thrown_at = e.created_at AND gd.source = 'camera'
    )
    DELETE FROM dart_samples WHERE id IN (
      SELECT r.id FROM ranked r, total t WHERE t.bytes > ${maxBytes} AND r.running - r.bytes < t.bytes - ${maxBytes}
    )
    RETURNING id`.execute(db)
  return result.rows.length
}
