// Minigolf courses and holes: admins write official ones and read every draft; with
// minigolf.userCourses.enabled a player writes their own (visibility private, public once published)
// and reads the published ones (schema/api-v1.yaml, tag minigolf; see
// docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md and the user-courses plan).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from '../db/schema.js'
import { isAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import {
  listCourses,
  getCourse,
  createCourse,
  saveCourseDraft,
  publishCourse,
  discardCourseDraft,
  unpublishCourse,
  deleteCourse,
  isBuiltInCourse,
  canReadCourse,
  canWriteCourse,
  canReadHole,
  canWriteHole,
  seesDraft,
  visibleTo,
  ownedCounts,
  foreignHoleIds,
  listHoles,
  getHole,
  createHole,
  saveHoleDraft,
  deleteHole,
  draftedHoleIds,
  type CourseRow,
  type CourseViewer,
  type CourseContent,
  type HoleRow,
} from '../db/minigolfCourses.js'
import { COURSE_TEXT_MAX, MINIGOLF_LIMITS, type MinigolfLimit } from '../shared/minigolf/limits.js'
import { holeSchema } from '../shared/minigolf/holeSchema.js'
import type { Hole } from '../shared/minigolf/types.js'
import { normalizeName } from '../shared/names.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'
import type { components } from '../schema/api.js'

// A Hole is the API's MinigolfHole with readonly points; the generated type has plain number[]
// (the same JSON, AJV checks the lengths), so a Hole goes out cast and comes in through holeSchema.
type ApiHole = components['schemas']['MinigolfHole']
// oxlint-disable-next-line typescript/consistent-type-assertions -- the same JSON, only Pt's readonly differs
export const toApiHole = (h: Hole | null) => h as ApiHole | null

/** The body's hole, refused when its shape is malformed. Checked here, not in the spec: AJV can't
 *  compare lengths, and responses must still serialize a stored hole saved before this check. */
function bodyHole(body: unknown): Hole {
  const hole = holeSchema.parse(body)
  const shape = hole.shape
  const invalid = (path: string, message: string) =>
    new ApiError(400, { error: 'invalid request', details: [{ path: `body/hole/shape/${path}`, message }] })
  if (shape && shape.curves.length !== shape.corners.length) throw invalid('curves', 'must have one entry per corner')
  const i = shape?.circles.findIndex(c => !(c.r > 0)) ?? -1
  if (i >= 0) throw invalid(`circles/${i}/r`, 'must be positive')
  return hole
}

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** The signed-in user as the course rules see them. An admin may always; others only with the flag. */
export async function viewerOf(db: Kysely<Database>, userId: string): Promise<CourseViewer> {
  const user = await loadFlagUser(db, userId)
  const admin = !!user && isAdmin(user)
  return { id: userId, admin, userCourses: admin || (await flagEnabled('minigolf.userCourses.enabled', user)) }
}

const forbidden = () => new ApiError(403, { error: 'forbidden' })
const notFound = () => new ApiError(404, { error: 'not found' })
const limitReached = (limit: MinigolfLimit) => new ApiError(409, { error: 'limit reached', limit, max: MINIGOLF_LIMITS[limit] })

/** A course the viewer may write; 404 for one they can't read at all, 403 for one they can only read. */
async function writableCourse(db: Kysely<Database>, id: string, v: CourseViewer): Promise<CourseRow> {
  const row = await getCourse(db, id)
  if (!row || !canReadCourse(row, v)) throw notFound()
  if (!canWriteCourse(row.ownerUserId, v)) throw forbidden()
  return row
}

/** A hole the viewer may write (same 404/403 split). */
async function writableHole(db: Kysely<Database>, id: string, v: CourseViewer): Promise<HoleRow> {
  const row = await getHole(db, id)
  if (!row || !(await canReadHole(db, row, v))) throw notFound()
  if (!canWriteHole(row, v)) throw forbidden()
  return row
}

/** A course uses only its owner's holes (so editing never changes someone else's course; official courses use admin-made ones); a player's has at most courseHoles. */
async function checkCourseHoles(db: Kysely<Database>, ownerId: string | null, content: CourseContent): Promise<void> {
  if (ownerId !== null && content.holeIds.length > MINIGOLF_LIMITS.courseHoles) throw limitReached('courseHoles')
  const foreign = await foreignHoleIds(db, ownerId, content.holeIds)
  if (foreign.length > 0)
    throw new ApiError(400, {
      error: 'invalid request',
      details: [{ path: 'body/holeIds', message: "A course can only use its owner's holes; copy a hole to use it" }],
    })
}

/** Course texts are shown to other players, so they follow the names' rules: trimmed, Unicode NFC, no control characters, short. */
// oxlint-disable-next-line no-control-regex -- the point is to refuse them
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

function cleanCourseText(content: CourseContent): CourseContent {
  return { ...content, name: normalizeName(content.name), description: normalizeName(content.description) }
}

function checkCourseText(content: CourseContent): void {
  const invalid = (path: string, message: string) =>
    new ApiError(400, { error: 'invalid request', details: [{ path: `body/${path}`, message }] })
  for (const field of ['name', 'description'] as const) {
    if (Array.from(content[field]).length > COURSE_TEXT_MAX[field])
      throw invalid(field, `must be at most ${COURSE_TEXT_MAX[field]} characters`)
    if (CONTROL_CHARS.test(content[field])) throw invalid(field, 'must not contain control characters')
  }
}

type ApiCourse = Omit<CourseRow, 'updatedAt' | 'publishedAt' | 'draft' | 'moderation'> & {
  updatedAt: string
  publishedAt: string | null
  moderation?: { reason: string; at: string } | null
  draft?: CourseRow['draft']
  hasChanges?: boolean
  builtIn?: boolean
}

/**
 * A course row as the API returns it. Its owner and admins get `draft`, `hasChanges` (its own
 * draft, or a draft of one of its holes: `drafted`, from draftedHoleIds) and `builtIn`; others none.
 */
function serializeCourse(row: CourseRow, v: CourseViewer, drafted: Set<string>): ApiCourse {
  const base = {
    id: row.id,
    ownerUserId: row.ownerUserId,
    authorName: row.authorName,
    visibility: row.visibility,
    published: row.published,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }
  if (!seesDraft(row.ownerUserId, v)) return base
  const hasChanges = row.draft !== null || (row.published?.holeIds ?? []).some(id => drafted.has(id))
  const moderation = row.moderation && { reason: row.moderation.reason, at: row.moderation.at.toISOString() }
  return { ...base, draft: row.draft, hasChanges, builtIn: isBuiltInCourse(row.id), moderation }
}

/** The course after a write, read again so it carries the author's name. */
async function respondCourse(db: Kysely<Database>, id: string, v: CourseViewer): Promise<ApiCourse> {
  const row = await getCourse(db, id)
  if (!row) throw notFound()
  return serializeCourse(visibleTo(row, v), v, await draftedHoleIds(db))
}

type ApiHoleRow = Omit<HoleRow, 'updatedAt' | 'publishedAt' | 'published' | 'draft'> & {
  published: ApiHole | null
  draft: ApiHole | null
  updatedAt: string
  publishedAt: string | null
  usedBy?: number
}

/** A hole row; `draft` only for its owner and admins. */
function serializeHoleRow(row: HoleRow & { usedBy?: number }, v: CourseViewer): ApiHoleRow {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    published: toApiHole(row.published),
    draft: seesDraft(row.ownerUserId, v) ? toApiHole(row.draft) : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ...(row.usedBy !== undefined && { usedBy: row.usedBy }),
  }
}

/** Courses and holes. Reads: every signed-in user (user courses need the flag). Writes: a course's or hole's owner with the flag, and admins. */
export function minigolfCoursesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'listMinigolfCourses'>>(
    '/api/minigolf/courses',
    { preValidation: requireAuth, schema: fromSpec('listMinigolfCourses') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const rows = await listCourses(db, v)
      const drafted = await draftedHoleIds(db)
      return { courses: rows.map(r => serializeCourse(r, v, drafted)) }
    },
  )

  app.post<Route<'createMinigolfCourse'>>(
    '/api/minigolf/courses',
    { preValidation: requireAuth, schema: fromSpec('createMinigolfCourse') },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      if (!v.userCourses) throw forbidden()
      const ownerId = v.admin ? null : v.id
      if (ownerId && (await ownedCounts(db, ownerId)).courses >= MINIGOLF_LIMITS.courses) throw limitReached('courses')
      const content = cleanCourseText(req.body)
      checkCourseText(content)
      await checkCourseHoles(db, ownerId, content)
      const row = await createCourse(db, content, ownerId)
      return reply.code(201).send(await respondCourse(db, row.id, v))
    },
  )

  app.get<Route<'getMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: requireAuth, schema: fromSpec('getMinigolfCourse') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const row = await getCourse(db, req.params.id)
      if (!row || !canReadCourse(row, v)) throw notFound()
      return serializeCourse(visibleTo(row, v), v, await draftedHoleIds(db))
    },
  )

  app.patch<Route<'saveMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: requireAuth, schema: fromSpec('saveMinigolfCourse') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const course = await writableCourse(db, req.params.id, v)
      const content = cleanCourseText(req.body.content)
      checkCourseText(content)
      await checkCourseHoles(db, course.ownerUserId, content)
      const result = await saveCourseDraft(db, req.params.id, req.body.version, content)
      if (result === 'missing') throw notFound()
      if (result === 'conflict') throw new ApiError(409, { error: 'conflict' })
      return respondCourse(db, req.params.id, v)
    },
  )

  app.delete<Route<'deleteMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: requireAuth, schema: fromSpec('deleteMinigolfCourse') },
    async (req, reply) => {
      await writableCourse(db, req.params.id, await viewerOf(db, req.userId))
      if (isBuiltInCourse(req.params.id)) throw new ApiError(409, { error: 'built-in course' })
      if (!(await deleteCourse(db, req.params.id))) throw notFound()
      return reply.code(204).send()
    },
  )

  app.post<Route<'publishMinigolfCourse'>>(
    '/api/minigolf/courses/:id/publish',
    { preValidation: requireAuth, schema: fromSpec('publishMinigolfCourse') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const course = await writableCourse(db, req.params.id, v)
      const refusal = !v.admin && course.moderation && `A moderator took this course out of play: ${course.moderation.reason}`
      const nameless = (course.draft ?? course.published)?.name === ''
      if (refusal || nameless)
        throw new ApiError(422, {
          error: 'invalid',
          problems: [{ holeId: '', checks: [{ level: 'error', message: refusal || 'Give the course a name' }] }],
        })
      if (
        course.ownerUserId &&
        course.published === null &&
        (await ownedCounts(db, course.ownerUserId)).published >= MINIGOLF_LIMITS.published
      )
        throw limitReached('published')
      const result = await publishCourse(db, req.params.id)
      if (result === 'missing') throw notFound()
      if (!result.ok) throw new ApiError(422, { error: 'invalid', problems: result.problems })
      return respondCourse(db, req.params.id, v)
    },
  )

  app.post<Route<'discardMinigolfCourse'>>(
    '/api/minigolf/courses/:id/discard',
    { preValidation: requireAuth, schema: fromSpec('discardMinigolfCourse') },
    async req => {
      const v = await viewerOf(db, req.userId)
      await writableCourse(db, req.params.id, v)
      if ((await discardCourseDraft(db, req.params.id)) === 'missing') throw notFound()
      return respondCourse(db, req.params.id, v)
    },
  )

  app.post<Route<'unpublishMinigolfCourse'>>(
    '/api/minigolf/courses/:id/unpublish',
    { preValidation: requireAuth, schema: fromSpec('unpublishMinigolfCourse') },
    async req => {
      const v = await viewerOf(db, req.userId)
      await writableCourse(db, req.params.id, v)
      if ((await unpublishCourse(db, req.params.id)) === 'missing') throw notFound()
      return respondCourse(db, req.params.id, v)
    },
  )

  app.get<Route<'listMinigolfHoles'>>(
    '/api/minigolf/holes',
    { preValidation: requireAuth, schema: fromSpec('listMinigolfHoles') },
    async req => {
      const v = await viewerOf(db, req.userId)
      if (!v.userCourses) throw forbidden()
      const rows = await listHoles(db, { search: req.query.search, ownerId: v.admin ? undefined : v.id })
      return { holes: rows.map(r => serializeHoleRow(r, v)) }
    },
  )

  app.post<Route<'createMinigolfHole'>>(
    '/api/minigolf/holes',
    { preValidation: requireAuth, schema: fromSpec('createMinigolfHole') },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      if (!v.userCourses) throw forbidden()
      const ownerId = v.admin ? null : v.id
      if (ownerId && (await ownedCounts(db, ownerId)).holes >= MINIGOLF_LIMITS.holes) throw limitReached('holes')
      let hole: Hole
      if ('copyOf' in req.body) {
        const source = await getHole(db, req.body.copyOf)
        const mayCopy = source && (await canReadHole(db, source, v))
        const content = source && seesDraft(source.ownerUserId, v) ? (source.draft ?? source.published) : source?.published
        if (!mayCopy || !content) throw notFound()
        hole = { ...content, id: ulid(), name: `${content.name} (copy)` }
      } else {
        hole = { ...bodyHole(req.body.hole), id: ulid() }
      }
      const row = await createHole(db, hole, ownerId)
      return reply.code(201).send(serializeHoleRow(row, v))
    },
  )

  app.get<Route<'getMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: requireAuth, schema: fromSpec('getMinigolfHole') },
    async req => {
      const v = await viewerOf(db, req.userId)
      const row = await getHole(db, req.params.id)
      if (!row) throw notFound()
      if (!(await canReadHole(db, row, v))) throw notFound()
      return serializeHoleRow(row, v)
    },
  )

  app.patch<Route<'saveMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: requireAuth, schema: fromSpec('saveMinigolfHole') },
    async req => {
      const v = await viewerOf(db, req.userId)
      await writableHole(db, req.params.id, v)
      const result = await saveHoleDraft(db, req.params.id, req.body.version, { ...bodyHole(req.body.hole), id: req.params.id })
      if (result === 'missing') throw notFound()
      if (result === 'conflict') throw new ApiError(409, { error: 'conflict' })
      return serializeHoleRow(result, v)
    },
  )

  app.delete<Route<'deleteMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: requireAuth, schema: fromSpec('deleteMinigolfHole') },
    async (req, reply) => {
      await writableHole(db, req.params.id, await viewerOf(db, req.userId))
      const result = await deleteHole(db, req.params.id)
      if (result === 'missing') throw notFound()
      if (result === 'in-use') throw new ApiError(409, { error: 'in use' })
      return reply.code(204).send()
    },
  )

  done()
}
