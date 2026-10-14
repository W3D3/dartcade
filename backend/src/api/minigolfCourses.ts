// Minigolf courses and holes: admins read and write drafts; players read published official
// courses only (schema/api-v1.yaml, tag minigolf; see docs/superpowers/specs/2026-10-14-minigolf-course-editor-design.md).
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from '../db/schema.js'
import { isAdmin, requireAdmin } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { getRoleAndEmail } from '../db/users.js'
import {
  listCourses,
  getCourse,
  createCourse,
  saveCourseDraft,
  publishCourse,
  discardCourseDraft,
  deleteCourse,
  listHoles,
  getHole,
  createHole,
  saveHoleDraft,
  deleteHole,
  draftedHoleIds,
  type CourseRow,
  type HoleRow,
} from '../db/minigolfCourses.js'
import { holeSchema } from '../shared/minigolf/holeSchema.js'
import type { Hole } from '../shared/minigolf/types.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'
import type { components } from '../schema/api.js'

// A Hole is the API's MinigolfHole with readonly points; the generated type has plain number[]
// (the same JSON, AJV checks the lengths), so a Hole goes out cast and comes in through holeSchema.
type ApiHole = components['schemas']['MinigolfHole']
// oxlint-disable-next-line typescript/consistent-type-assertions -- the same JSON, only Pt's readonly differs
const toApiHole = (h: Hole | null) => h as ApiHole | null

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

/** The signed-in user's isAdmin (requireAdmin's check). */
async function viewerIsAdmin(db: Kysely<Database>, userId: string): Promise<boolean> {
  const user = await getRoleAndEmail(db, userId)
  return !!user && isAdmin(user)
}

type ApiCourse = Omit<CourseRow, 'updatedAt' | 'publishedAt' | 'draft'> & {
  updatedAt: string
  publishedAt: string | null
  draft?: CourseRow['draft']
  hasChanges?: boolean
}

/**
 * A course row as the API returns it. Admins get `draft` and `hasChanges`: its own draft, or a
 * draft of one of its holes (`drafted`, from draftedHoleIds); a player gets neither.
 */
function serializeCourse(row: CourseRow, drafted: Set<string> | null): ApiCourse {
  const base = {
    id: row.id,
    ownerUserId: row.ownerUserId,
    visibility: row.visibility,
    published: row.published,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }
  if (!drafted) return base
  const hasChanges = row.draft !== null || (row.published?.holeIds ?? []).some(id => drafted.has(id))
  return { ...base, draft: row.draft, hasChanges }
}

type ApiHoleRow = Omit<HoleRow, 'updatedAt' | 'publishedAt' | 'published' | 'draft'> & {
  published: ApiHole | null
  draft: ApiHole | null
  updatedAt: string
  publishedAt: string | null
  usedBy?: number
}

function serializeHoleRow(row: HoleRow & { usedBy?: number }): ApiHoleRow {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    published: toApiHole(row.published),
    draft: toApiHole(row.draft),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    ...(row.usedBy !== undefined && { usedBy: row.usedBy }),
  }
}

/** Courses and holes: GET /courses(/:id) are requireAuth only (hiding drafts from non-admins); every other route is admin-only. */
export function minigolfCoursesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const adminOnly = [requireAuth, requireAdmin]

  app.get<Route<'listMinigolfCourses'>>(
    '/api/minigolf/courses',
    { preValidation: requireAuth, schema: fromSpec('listMinigolfCourses') },
    async req => {
      const admin = await viewerIsAdmin(db, req.userId)
      const rows = await listCourses(db, { drafts: admin })
      const drafted = admin ? await draftedHoleIds(db) : null
      return { courses: rows.map(r => serializeCourse(r, drafted)) }
    },
  )

  app.post<Route<'createMinigolfCourse'>>(
    '/api/minigolf/courses',
    { preValidation: adminOnly, schema: fromSpec('createMinigolfCourse') },
    async (req, reply) => {
      const row = await createCourse(db, req.body)
      return reply.code(201).send(serializeCourse(row, await draftedHoleIds(db)))
    },
  )

  app.get<Route<'getMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: requireAuth, schema: fromSpec('getMinigolfCourse') },
    async (req, reply) => {
      const row = await getCourse(db, req.params.id)
      const admin = await viewerIsAdmin(db, req.userId)
      if (!row || (!admin && row.published === null)) return reply.code(404).send({ error: 'not found' })
      return serializeCourse(row, admin ? await draftedHoleIds(db) : null)
    },
  )

  app.patch<Route<'saveMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: adminOnly, schema: fromSpec('saveMinigolfCourse') },
    async req => {
      const result = await saveCourseDraft(db, req.params.id, req.body.version, req.body.content)
      if (result === 'missing') throw new ApiError(404, { error: 'not found' })
      if (result === 'conflict') throw new ApiError(409, { error: 'conflict' })
      return serializeCourse(result, await draftedHoleIds(db))
    },
  )

  app.delete<Route<'deleteMinigolfCourse'>>(
    '/api/minigolf/courses/:id',
    { preValidation: adminOnly, schema: fromSpec('deleteMinigolfCourse') },
    async (req, reply) => {
      if (!(await deleteCourse(db, req.params.id))) return reply.code(404).send({ error: 'not found' })
      return reply.code(204).send()
    },
  )

  app.post<Route<'publishMinigolfCourse'>>(
    '/api/minigolf/courses/:id/publish',
    { preValidation: adminOnly, schema: fromSpec('publishMinigolfCourse') },
    async req => {
      const result = await publishCourse(db, req.params.id)
      if (result === 'missing') throw new ApiError(404, { error: 'not found' })
      if (!result.ok) throw new ApiError(422, { error: 'invalid', problems: result.problems })
      return serializeCourse(result.course, await draftedHoleIds(db))
    },
  )

  app.post<Route<'discardMinigolfCourse'>>(
    '/api/minigolf/courses/:id/discard',
    { preValidation: adminOnly, schema: fromSpec('discardMinigolfCourse') },
    async req => {
      const result = await discardCourseDraft(db, req.params.id)
      if (result === 'missing') throw new ApiError(404, { error: 'not found' })
      return serializeCourse(result, await draftedHoleIds(db))
    },
  )

  app.get<Route<'listMinigolfHoles'>>(
    '/api/minigolf/holes',
    { preValidation: adminOnly, schema: fromSpec('listMinigolfHoles') },
    async req => {
      const rows = await listHoles(db, { search: req.query.search })
      return { holes: rows.map(serializeHoleRow) }
    },
  )

  app.post<Route<'createMinigolfHole'>>(
    '/api/minigolf/holes',
    { preValidation: adminOnly, schema: fromSpec('createMinigolfHole') },
    async (req, reply) => {
      let hole: Hole
      if ('copyOf' in req.body) {
        const source = await getHole(db, req.body.copyOf)
        const content = source?.draft ?? source?.published
        if (!content) return reply.code(404).send({ error: 'not found' })
        hole = { ...content, id: ulid(), name: `${content.name} (copy)` }
      } else {
        hole = { ...holeSchema.parse(req.body.hole), id: ulid() }
      }
      const row = await createHole(db, hole)
      return reply.code(201).send(serializeHoleRow(row))
    },
  )

  app.get<Route<'getMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: adminOnly, schema: fromSpec('getMinigolfHole') },
    async (req, reply) => {
      const row = await getHole(db, req.params.id)
      if (!row) return reply.code(404).send({ error: 'not found' })
      return serializeHoleRow(row)
    },
  )

  app.patch<Route<'saveMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: adminOnly, schema: fromSpec('saveMinigolfHole') },
    async req => {
      const result = await saveHoleDraft(db, req.params.id, req.body.version, { ...holeSchema.parse(req.body.hole), id: req.params.id })
      if (result === 'missing') throw new ApiError(404, { error: 'not found' })
      if (result === 'conflict') throw new ApiError(409, { error: 'conflict' })
      return serializeHoleRow(result)
    },
  )

  app.delete<Route<'deleteMinigolfHole'>>(
    '/api/minigolf/holes/:id',
    { preValidation: adminOnly, schema: fromSpec('deleteMinigolfHole') },
    async (req, reply) => {
      const result = await deleteHole(db, req.params.id)
      if (result === 'missing') return reply.code(404).send({ error: 'not found' })
      if (result === 'in-use') return reply.code(409).send({ error: 'in use' })
      return reply.code(204).send()
    },
  )

  done()
}
