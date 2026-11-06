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

// A sample's label, from its game dart's correction: the one place the rule is written
const LABEL = sql<SampleLabel>`CASE WHEN gd.corrected IS NOT TRUE THEN 'autodarts' WHEN gd.coords IS NOT NULL THEN 'corrected_spot' ELSE 'corrected_segment' END`

// Samples with their game dart (none outside a game): the join the label and the pruning order read
function withGameDart(db: Kysely<Database>) {
  return db
    .selectFrom('dart_samples as s')
    .leftJoin('game_session_events as e', 'e.bridge_event_id', 's.bridge_event_id')
    .leftJoin('game_darts as gd', join =>
      join.onRef('gd.session_id', '=', 'e.session_id').onRef('gd.thrown_at', '=', 'e.created_at').on('gd.source', '=', 'camera'),
    )
}

// Labelled samples, of one label or all, leaving out invalidated games
function labelledQuery(db: Kysely<Database>, label?: SampleLabel) {
  let q = withGameDart(db)
    .innerJoin('bridge_events as be', 'be.id', 's.bridge_event_id')
    .leftJoin('game_sessions as gs', 'gs.id', 'e.session_id')
    .where('gs.invalidated_at', 'is', null)
    .select(['s.id', 's.board_id', 's.bm_version', 's.captured_at', 'be.data as detected', 'gd.segment', 'gd.coords', 'gd.corrected'])
    .select(LABEL.as('label'))
  if (label) q = q.where(LABEL, '=', label)
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
  label: SampleLabel
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
  return { id: r.id, boardId: r.board_id, bmVersion: r.bm_version, capturedAt: r.captured_at, autodarts, final, label: r.label }
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
  opts: { afterId?: string; upToId?: string; label?: SampleLabel; limit: number; settledBefore: Date },
): Promise<LabelledSample[]> {
  let q = labelledQuery(db, opts.label).where('s.captured_at', '<', opts.settledBefore).orderBy('s.id', 'asc')
  if (opts.afterId) q = q.where('s.id', '>', opts.afterId)
  if (opts.upToId) q = q.where('s.id', '<=', opts.upToId)
  const rows = await q.limit(opts.limit).execute()
  return rows.map(toLabelled).filter(s => s !== null)
}

/** The newest sample a download may include now (see exportSamples); null when none is settled. */
export async function newestSettledId(db: Kysely<Database>, settledBefore: Date): Promise<string | null> {
  const row = await db
    .selectFrom('dart_samples')
    .select(eb => eb.fn.max('id').as('id'))
    .where('captured_at', '<', settledBefore)
    .executeTakeFirst()
  return row?.id ?? null
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
      .select(LABEL.as('label'))
      .select(eb => eb.fn.countAll<string>().as('n'))
      .groupBy(LABEL)
      .execute(),
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
  const count = (label: SampleLabel) => Number(labels.find(l => l.label === label)?.n ?? 0)
  return {
    byLabel: {
      autodarts: count('autodarts'),
      corrected_spot: count('corrected_spot'),
      corrected_segment: count('corrected_segment'),
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
  const ranked = withGameDart(db)
    .select(['s.id', 's.bytes'])
    .select(sql<string>`sum(s.bytes) OVER (ORDER BY coalesce(gd.corrected, false), s.id)`.as('running'))
  const excess = Number(bytes) - maxBytes
  const result = await db
    .with('ranked', () => ranked)
    .deleteFrom('dart_samples')
    .where('id', 'in', eb =>
      eb
        .selectFrom('ranked')
        .select('ranked.id')
        .where(sql<boolean>`ranked.running - ranked.bytes < ${excess}`),
    )
    .returning('id')
    .execute()
  return result.length
}
