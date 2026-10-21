// Courses and holes the editor drafts and publishes. A game reads the published course at
// start (publishedCourse/publishedOfficialHoles); the editor reads and writes drafts.
import { sql, type Kysely } from 'kysely'
import { ulid } from 'ulid'
import { z } from 'zod'
import type { Database } from './schema.js'
import { holeChecks, type Check } from '../shared/minigolf/checks.js'
import { holeSchema } from '../shared/minigolf/holeSchema.js'
import { greenhornCourse } from '../shared/minigolf/courses/greenhorn.js'
import { kingfisherCourse } from '../shared/minigolf/courses/kingfisher.js'
import type { Course, Hole } from '../shared/minigolf/types.js'

export type CourseContent = { name: string; description: string; difficulty: 1 | 2 | 3; holeIds: string[] }
export type CourseRow = {
  id: string
  ownerUserId: string | null
  visibility: 'official'
  published: CourseContent | null
  draft: CourseContent | null
  version: number
  updatedAt: Date
  publishedAt: Date | null
}
export type HoleRow = {
  id: string
  ownerUserId: string | null
  published: Hole | null
  draft: Hole | null
  version: number
  updatedAt: Date
  publishedAt: Date | null
}

// JSON columns are read defensively: a value that doesn't parse reads as absent (lobbies.ts's pattern)
const CourseContentSchema = z.object({
  name: z.string(),
  description: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  holeIds: z.array(z.string()),
}) satisfies z.ZodType<CourseContent>

function parsedJson<T>(schema: z.ZodType<T>, value: unknown): T | null {
  if (value === null || value === undefined) return null
  const r = schema.safeParse(value)
  return r.success ? r.data : null
}

/** The holes a course's contents (its draft, its published, …) use. */
function holeIdsOf(...contents: unknown[]): Set<string> {
  return new Set(contents.flatMap(c => parsedJson(CourseContentSchema, c)?.holeIds ?? []))
}

/** A course's or a hole's row: both tables have these columns. */
type DbRow = {
  id: string
  owner_user_id: string | null
  published: unknown
  draft: unknown
  version: number
  updated_at: Date
  published_at: Date | null
}

function toCourseRow(r: DbRow): CourseRow {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    visibility: 'official',
    published: parsedJson(CourseContentSchema, r.published),
    draft: parsedJson(CourseContentSchema, r.draft),
    version: r.version,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  }
}

function toHoleRow(r: DbRow): HoleRow {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    published: parsedJson(holeSchema, r.published),
    draft: parsedJson(holeSchema, r.draft),
    version: r.version,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  }
}

/** All courses, or (without drafts) only the published ones, with their draft nulled out. */
export async function listCourses(db: Kysely<Database>, opts: { drafts: boolean }): Promise<CourseRow[]> {
  let q = db.selectFrom('minigolf_courses').selectAll()
  if (!opts.drafts) q = q.where('published', 'is not', null)
  const rows = await q.orderBy('created_at').execute()
  return rows.map(r => {
    const row = toCourseRow(r)
    return opts.drafts ? row : { ...row, draft: null }
  })
}

export async function getCourse(db: Kysely<Database>, id: string): Promise<CourseRow | undefined> {
  const row = await db.selectFrom('minigolf_courses').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? toCourseRow(row) : undefined
}

export async function getHole(db: Kysely<Database>, id: string): Promise<HoleRow | undefined> {
  const row = await db.selectFrom('minigolf_holes').selectAll().where('id', '=', id).executeTakeFirst()
  return row ? toHoleRow(row) : undefined
}

/** The hole library: every hole, how many courses (draft or published) use it, newest edit first. */
export async function listHoles(db: Kysely<Database>, opts: { search?: string } = {}): Promise<(HoleRow & { usedBy: number })[]> {
  const [holeRows, courseRows] = await Promise.all([
    db.selectFrom('minigolf_holes').selectAll().orderBy('updated_at', 'desc').execute(),
    db.selectFrom('minigolf_courses').select(['draft', 'published']).execute(),
  ])
  const usedBy = new Map<string, number>()
  for (const c of courseRows) for (const id of holeIdsOf(c.draft, c.published)) usedBy.set(id, (usedBy.get(id) ?? 0) + 1)
  const search = opts.search?.trim().toLowerCase()
  return holeRows
    .map(r => ({ ...toHoleRow(r), usedBy: usedBy.get(r.id) ?? 0 }))
    .filter(h => !search || (h.draft?.name ?? h.published?.name ?? '').toLowerCase().includes(search))
}

/** The ids of the holes that have a draft (a course using one has changes to publish). */
export async function draftedHoleIds(db: Kysely<Database>): Promise<Set<string>> {
  const rows = await db.selectFrom('minigolf_holes').select('id').where('draft', 'is not', null).execute()
  return new Set(rows.map(r => r.id))
}

/** A new course, draft only (not yet published). */
export async function createCourse(db: Kysely<Database>, content: CourseContent): Promise<CourseRow> {
  const row = await db
    .insertInto('minigolf_courses')
    .values({ id: ulid(), owner_user_id: null, visibility: 'official', draft: JSON.stringify(content) })
    .returningAll()
    .executeTakeFirstOrThrow()
  return toCourseRow(row)
}

/** A new hole, draft only (not yet published); the hole's own id is the row id. */
export async function createHole(db: Kysely<Database>, hole: Hole): Promise<HoleRow> {
  const row = await db
    .insertInto('minigolf_holes')
    .values({ id: hole.id, owner_user_id: null, draft: JSON.stringify(hole) })
    .returningAll()
    .executeTakeFirstOrThrow()
  return toHoleRow(row)
}

/** Overwrites the draft if `version` is still current (optimistic concurrency), bumping it. */
async function saveDraft(
  db: Kysely<Database>,
  table: 'minigolf_courses' | 'minigolf_holes',
  id: string,
  version: number,
  draft: CourseContent | Hole,
): Promise<DbRow | 'conflict' | 'missing'> {
  const row = await db
    .updateTable(table)
    .set({ draft: JSON.stringify(draft), version: sql<number>`version + 1`, updated_at: sql<Date>`now()` })
    .where('id', '=', id)
    .where('version', '=', version)
    .returningAll()
    .executeTakeFirst()
  if (row) return row
  return (await db.selectFrom(table).select('id').where('id', '=', id).executeTakeFirst()) ? 'conflict' : 'missing'
}

export async function saveCourseDraft(
  db: Kysely<Database>,
  id: string,
  version: number,
  content: CourseContent,
): Promise<CourseRow | 'conflict' | 'missing'> {
  const row = await saveDraft(db, 'minigolf_courses', id, version, content)
  return typeof row === 'string' ? row : toCourseRow(row)
}

export async function saveHoleDraft(
  db: Kysely<Database>,
  id: string,
  version: number,
  hole: Hole,
): Promise<HoleRow | 'conflict' | 'missing'> {
  const row = await saveDraft(db, 'minigolf_holes', id, version, hole)
  return typeof row === 'string' ? row : toHoleRow(row)
}

/**
 * Checks the course and every hole its content (draft, else published) uses; if any has a
 * blocking error, refuses and changes nothing. Otherwise copies each hole's draft to published
 * (holes with no draft are left as they are) and then the course's, clearing both drafts.
 */
export async function publishCourse(
  db: Kysely<Database>,
  id: string,
): Promise<{ ok: true; course: CourseRow } | { ok: false; problems: { holeId: string; checks: Check[] }[] } | 'missing'> {
  return db.transaction().execute(async trx => {
    const courseRow = await trx.selectFrom('minigolf_courses').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
    if (!courseRow) return 'missing'
    const course = toCourseRow(courseRow)
    const content = course.draft ?? course.published
    if (!content) return { ok: true, course }
    // A problem with the course itself has no hole: holeId ''
    if (content.holeIds.length === 0)
      return { ok: false, problems: [{ holeId: '', checks: [{ level: 'error', message: 'Add at least one hole' }] }] }

    const holeRows = new Map<string, HoleRow>()
    const problems: { holeId: string; checks: Check[] }[] = []
    // Sorted so two publishes sharing holes always lock them in the same order, never deadlocking
    for (const holeId of [...content.holeIds].sort()) {
      const holeDbRow = await trx.selectFrom('minigolf_holes').selectAll().where('id', '=', holeId).forUpdate().executeTakeFirst()
      if (!holeDbRow) {
        problems.push({ holeId, checks: [{ level: 'error', message: 'Hole no longer exists' }] })
        continue
      }
      const holeRow = toHoleRow(holeDbRow)
      holeRows.set(holeId, holeRow)
      const holeContent = holeRow.draft ?? holeRow.published
      if (!holeContent) {
        problems.push({ holeId, checks: [{ level: 'error', message: 'Hole has no content' }] })
        continue
      }
      const checks = holeChecks(holeContent)
      if (checks.some(c => c.level === 'error')) problems.push({ holeId, checks })
    }
    if (problems.length > 0) return { ok: false, problems }

    for (const [holeId, holeRow] of holeRows) {
      if (holeRow.draft !== null) {
        await trx
          .updateTable('minigolf_holes')
          .set({
            published: JSON.stringify(holeRow.draft),
            draft: null,
            version: sql<number>`version + 1`,
            published_at: sql<Date>`now()`,
            updated_at: sql<Date>`now()`,
          })
          .where('id', '=', holeId)
          .execute()
      }
    }
    const updatedCourse = await trx
      .updateTable('minigolf_courses')
      .set({
        published: JSON.stringify(content),
        draft: null,
        version: sql<number>`version + 1`,
        published_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()
    return { ok: true, course: toCourseRow(updatedCourse) }
  })
}

/**
 * Clears the course's draft, and the drafts of its published holes (draft, else published) that
 * no other course uses, in its draft or published. A never-published course or hole has only its
 * draft, so it is left as it is.
 */
export async function discardCourseDraft(db: Kysely<Database>, id: string): Promise<CourseRow | 'missing'> {
  return db.transaction().execute(async trx => {
    const courseRow = await trx.selectFrom('minigolf_courses').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
    if (!courseRow) return 'missing'
    const course = toCourseRow(courseRow)
    if (course.published === null) return course
    const holeIds = (course.draft ?? course.published).holeIds

    const updated = await trx
      .updateTable('minigolf_courses')
      .set({ draft: null, version: sql<number>`version + 1`, updated_at: sql<Date>`now()` })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow()

    if (holeIds.length > 0) {
      const others = await trx.selectFrom('minigolf_courses').select(['draft', 'published']).where('id', '!=', id).execute()
      const stillUsed = holeIdsOf(...others.flatMap(c => [c.draft, c.published]))
      const toClear = holeIds.filter(holeId => !stillUsed.has(holeId)).sort()
      if (toClear.length > 0) {
        // Locked in id order first, as publishCourse does, so a discard and a publish never deadlock
        await trx.selectFrom('minigolf_holes').select('id').where('id', 'in', toClear).orderBy('id').forUpdate().execute()
        await trx
          .updateTable('minigolf_holes')
          .set({ draft: null, version: sql<number>`version + 1`, updated_at: sql<Date>`now()` })
          .where('id', 'in', toClear)
          .where('draft', 'is not', null)
          .where('published', 'is not', null)
          .execute()
      }
    }
    return toCourseRow(updated)
  })
}

/** Takes the course out of play: its published content becomes its draft (unless it has one), so
 *  nothing is lost and Publish brings it back. Its holes stay as they are. */
export async function unpublishCourse(db: Kysely<Database>, id: string): Promise<CourseRow | 'missing'> {
  const row = await db
    .updateTable('minigolf_courses')
    .set({
      draft: sql`COALESCE(draft, published)`,
      published: null,
      published_at: null,
      version: sql<number>`version + 1`,
      updated_at: sql<Date>`now()`,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst()
  return row ? toCourseRow(row) : 'missing'
}

/** Deletes the hole unless a course (draft or published) still uses it. */
export async function deleteHole(db: Kysely<Database>, id: string): Promise<'deleted' | 'in-use' | 'missing'> {
  return db.transaction().execute(async trx => {
    const hole = await trx.selectFrom('minigolf_holes').select('id').where('id', '=', id).forUpdate().executeTakeFirst()
    if (!hole) return 'missing'
    const courses = await trx.selectFrom('minigolf_courses').select(['draft', 'published']).execute()
    if (holeIdsOf(...courses.flatMap(c => [c.draft, c.published])).has(id)) return 'in-use'
    await trx.deleteFrom('minigolf_holes').where('id', '=', id).execute()
    return 'deleted'
  })
}

export async function deleteCourse(db: Kysely<Database>, id: string): Promise<boolean> {
  const result = await db.deleteFrom('minigolf_courses').where('id', '=', id).executeTakeFirst()
  return result.numDeletedRows > 0n
}

/**
 * A published course's name and holes, for a game to copy at start. Reads the course and its
 * holes in one REPEATABLE READ transaction, so a game started during a publish sees the course
 * whole, either before or after it. Undefined if the course doesn't exist or was never published.
 */
export async function publishedCourse(db: Kysely<Database>, id: string): Promise<{ name: string; holes: Hole[] } | undefined> {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async trx => {
      const courseRow = await trx.selectFrom('minigolf_courses').selectAll().where('id', '=', id).executeTakeFirst()
      if (!courseRow) return undefined
      const content = toCourseRow(courseRow).published
      if (!content) return undefined
      if (content.holeIds.length === 0) return { name: content.name, holes: [] }
      const holeRows = await trx.selectFrom('minigolf_holes').selectAll().where('id', 'in', content.holeIds).execute()
      const byId = new Map(holeRows.map(r => [r.id, toHoleRow(r)]))
      const holes = content.holeIds.flatMap(holeId => {
        const hole = byId.get(holeId)?.published
        return hole ? [hole] : []
      })
      return { name: content.name, holes }
    })
}

/** Every published hole of every published official course (for the "Mixed course" pool). */
export async function publishedOfficialHoles(db: Kysely<Database>): Promise<Hole[]> {
  const courseRows = await db
    .selectFrom('minigolf_courses')
    .select('published')
    .where('visibility', '=', 'official')
    .where('published', 'is not', null)
    .execute()
  const holeIds = holeIdsOf(...courseRows.map(c => c.published))
  if (holeIds.size === 0) return []
  const holeRows = await db
    .selectFrom('minigolf_holes')
    .selectAll()
    .where('id', 'in', [...holeIds])
    .execute()
  return holeRows.flatMap(r => {
    const hole = toHoleRow(r).published
    return hole ? [hole] : []
  })
}

type Seed = { course: Course; description: string; difficulty: CourseContent['difficulty'] }

/** The code courses seeded as official courses, published. */
const OFFICIAL_SEEDS: readonly Seed[] = [
  { course: greenhornCourse, description: 'Nine friendly holes, each with one new trick to learn.', difficulty: 1 },
  { course: kingfisherCourse, description: 'Nine classic holes that reward a true line and the right weight.', difficulty: 2 },
]

/** A course shipped with the code: it can be unpublished, not deleted (seeding would bring it back). */
export const isBuiltInCourse = (id: string): boolean => OFFICIAL_SEEDS.some(s => s.course.id === id)

/** Seeds each official code course once: a course whose id is already in the table is left alone.
 *  Tests pass their own `seeds`. */
export async function seedOfficialCourses(db: Kysely<Database>, seeds: readonly Seed[] = OFFICIAL_SEEDS): Promise<void> {
  const existing = new Set((await db.selectFrom('minigolf_courses').select('id').execute()).map(r => r.id))
  await db.transaction().execute(async trx => {
    for (const { course, description, difficulty } of seeds) {
      if (existing.has(course.id)) continue
      for (const hole of course.holes) {
        await trx
          .insertInto('minigolf_holes')
          .values({ id: hole.id, owner_user_id: null, published: JSON.stringify(hole), published_at: sql<Date>`now()` })
          .onConflict(oc => oc.column('id').doNothing())
          .execute()
      }
      const content: CourseContent = { name: course.name, description, difficulty, holeIds: course.holes.map(h => h.id) }
      await trx
        .insertInto('minigolf_courses')
        .values({
          id: course.id,
          owner_user_id: null,
          visibility: 'official',
          published: JSON.stringify(content),
          published_at: sql<Date>`now()`,
        })
        .onConflict(oc => oc.column('id').doNothing())
        .execute()
    }
  })
}
