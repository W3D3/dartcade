// Browsing published user courses, reporting them, and what moderators do about reports (migration
// 060). Moderator actions write an admin_audit row, like the games moderation.
import { sql, type Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from './schema.js'
import { holeSchema } from '../shared/minigolf/holeSchema.js'
import type { Hole } from '../shared/minigolf/types.js'
import { CourseContentSchema, parsedJson, unpublishCourse } from './minigolfCourses.js'

export type BrowseCourse = {
  id: string
  ownerUserId: string | null
  name: string
  description: string
  difficulty: 1 | 2 | 3
  authorName: string | null
  holeCount: number
  plays: number
  /** The course's first published hole. */
  thumbnail: Hole | null
}

const BROWSE_LIMIT = 100

/** Published user courses (never the official ones), as cards: the most played first, then the newest. */
async function browseRows(db: Kysely<Database>, filter: { search?: string; ids?: string[] }): Promise<BrowseCourse[]> {
  let q = db
    .selectFrom('minigolf_courses as c')
    .leftJoin('user as u', 'u.id', 'c.owner_user_id')
    .select(['c.id', 'c.owner_user_id', 'c.published', 'u.name as author_name'])
    .select(
      sql<number>`(SELECT count(*)::int FROM game_sessions g WHERE g.game_id = 'minigolf' AND g.config->>'course' = c.id)`.as('plays'),
    )
    .where('c.visibility', '=', 'public')
    .where('c.published', 'is not', null)
  const search = filter.search?.trim()
  if (search) q = q.where(sql<boolean>`c.published->>'name' ILIKE ${'%' + search.replace(/[\\%_]/g, '\\$&') + '%'}`)
  if (filter.ids) q = q.where('c.id', 'in', filter.ids)
  const rows = await q.orderBy('plays', 'desc').orderBy('c.published_at', 'desc').limit(BROWSE_LIMIT).execute()

  const courses = rows.flatMap(r => {
    const content = parsedJson(CourseContentSchema, r.published)
    return content ? [{ row: r, content }] : []
  })
  const firstIds = courses.flatMap(c => (c.content.holeIds[0] ? [c.content.holeIds[0]] : []))
  const holeRows = firstIds.length
    ? await db.selectFrom('minigolf_holes').select(['id', 'published']).where('id', 'in', firstIds).execute()
    : []
  const holes = new Map(holeRows.map(h => [h.id, parsedJson(holeSchema, h.published)]))
  return courses.map(({ row, content }) => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: content.name,
    description: content.description,
    difficulty: content.difficulty,
    authorName: row.author_name,
    holeCount: content.holeIds.length,
    plays: row.plays,
    thumbnail: holes.get(content.holeIds[0] ?? '') ?? null,
  }))
}

export const browseCourses = (db: Kysely<Database>, search?: string): Promise<BrowseCourse[]> => browseRows(db, { search })

/** Files the report; 'duplicate' if this person has an open report on the course already. */
export async function reportCourse(
  db: Kysely<Database>,
  courseId: string,
  reporterId: string,
  reason: string,
): Promise<'ok' | 'duplicate'> {
  const row = await db
    .insertInto('minigolf_course_reports')
    .values({ id: ulid(), course_id: courseId, reporter_user_id: reporterId, reason })
    .onConflict(oc => oc.columns(['course_id', 'reporter_user_id']).where('dismissed_at', 'is', null).doNothing())
    .returning('id')
    .executeTakeFirst()
  return row ? 'ok' : 'duplicate'
}

export type ReportedCourse = {
  course: BrowseCourse
  reports: { reporterName: string | null; reason: string; createdAt: Date }[]
}

/** Published user courses with open reports, the most reported first. */
export async function listReportedCourses(db: Kysely<Database>): Promise<ReportedCourse[]> {
  const reports = await db
    .selectFrom('minigolf_course_reports as r')
    .leftJoin('user as u', 'u.id', 'r.reporter_user_id')
    .select(['r.course_id', 'r.reason', 'r.created_at', 'u.name as reporter_name'])
    .where('r.dismissed_at', 'is', null)
    .orderBy('r.created_at')
    .execute()
  const byCourse = new Map<string, ReportedCourse['reports']>()
  for (const r of reports) {
    const list = byCourse.get(r.course_id) ?? []
    list.push({ reporterName: r.reporter_name, reason: r.reason, createdAt: r.created_at })
    byCourse.set(r.course_id, list)
  }
  if (byCourse.size === 0) return []
  const courses = await browseRows(db, { ids: [...byCourse.keys()] })
  return courses.map(course => ({ course, reports: byCourse.get(course.id) ?? [] })).sort((a, b) => b.reports.length - a.reports.length)
}

export type ModeratedCourse = { id: string; name: string; authorName: string | null; reason: string; at: Date }

/** Courses a moderator took out of play and nobody has allowed again, newest first. */
export async function listModeratedCourses(db: Kysely<Database>): Promise<ModeratedCourse[]> {
  const rows = await db
    .selectFrom('minigolf_courses as c')
    .leftJoin('user as u', 'u.id', 'c.owner_user_id')
    .select(['c.id', 'c.draft', 'c.moderation_reason', 'c.moderated_at', 'u.name as author_name'])
    .where('c.moderation_reason', 'is not', null)
    .orderBy('c.moderated_at', 'desc')
    .execute()
  return rows.flatMap(r =>
    r.moderation_reason !== null && r.moderated_at
      ? [
          {
            id: r.id,
            name: parsedJson(CourseContentSchema.pick({ name: true }), r.draft)?.name ?? '',
            authorName: r.author_name,
            reason: r.moderation_reason,
            at: r.moderated_at,
          },
        ]
      : [],
  )
}

async function audit(
  db: Kysely<Database>,
  adminId: string,
  action: string,
  courseId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await db
    .insertInto('admin_audit')
    .values({ admin_user_id: adminId, action, target: courseId, detail: JSON.stringify(detail) })
    .execute()
}

const closeReports = (db: Kysely<Database>, courseId: string) =>
  db
    .updateTable('minigolf_course_reports')
    .set({ dismissed_at: sql<Date>`now()` })
    .where('course_id', '=', courseId)
    .where('dismissed_at', 'is', null)
    .execute()

type UserCourse = { owner: string; published: unknown }

/**
 * One moderator action on a player's course (the official ones are the admins' own editor's): the
 * course is locked, the action and its admin_audit row run in one transaction, so a failed audit
 * write leaves nothing changed. `act` returns the audit action and its detail.
 */
async function moderate(
  db: Kysely<Database>,
  adminId: string,
  id: string,
  act: (trx: Kysely<Database>, course: UserCourse) => Promise<{ action: string; detail: Record<string, unknown> } | 'missing'>,
): Promise<'ok' | 'missing'> {
  return db.transaction().execute(async trx => {
    const row = await trx
      .selectFrom('minigolf_courses')
      .select(['owner_user_id', 'published'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!row?.owner_user_id) return 'missing'
    const done = await act(trx, { owner: row.owner_user_id, published: row.published })
    if (done === 'missing') return 'missing'
    await audit(trx, adminId, done.action, id, done.detail)
    return 'ok'
  })
}

/** Takes a published user course out of play with a reason its author sees; closes its reports. */
export const moderatorUnpublish = (db: Kysely<Database>, adminId: string, id: string, reason: string) =>
  moderate(db, adminId, id, async (trx, course) => {
    if ((await unpublishCourse(trx, id, reason)) === 'missing') return 'missing'
    await closeReports(trx, id)
    return { action: 'minigolf.unpublish', detail: { ownerId: course.owner, reason } }
  })

/** Deletes a user course; the reason stays in the audit log. */
export const moderatorRemove = (db: Kysely<Database>, adminId: string, id: string, reason: string) =>
  moderate(db, adminId, id, async (trx, course) => {
    const name = parsedJson(CourseContentSchema.pick({ name: true }), course.published)?.name ?? null
    await trx.deleteFrom('minigolf_courses').where('id', '=', id).execute()
    return { action: 'minigolf.remove', detail: { ownerId: course.owner, name, reason } }
  })

export const moderatorDismiss = (db: Kysely<Database>, adminId: string, id: string) =>
  moderate(db, adminId, id, async trx => {
    await closeReports(trx, id)
    return { action: 'minigolf.dismiss', detail: {} }
  })

/** Clears the moderation reason, so the author may publish the course again. */
export const moderatorAllow = (db: Kysely<Database>, adminId: string, id: string) =>
  moderate(db, adminId, id, async trx => {
    await trx.updateTable('minigolf_courses').set({ moderation_reason: null, moderated_at: null }).where('id', '=', id).execute()
    return { action: 'minigolf.allow', detail: {} }
  })
