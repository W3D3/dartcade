// Browsing, reporting and moderating user-made minigolf courses (schema/api-v1.yaml, tags minigolf and admin).
// Moderation is after the fact, like docs/superpowers/specs/2026-10-20-admin-moderation-design.md: no approval queue.
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireModerator } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { canReadCourse, getCourse } from '../db/minigolfCourses.js'
import {
  browseCourses,
  type BrowseCourse,
  listModeratedCourses,
  listReportedCourses,
  moderatorAllow,
  moderatorDismiss,
  moderatorRemove,
  moderatorUnpublish,
  reportCourse,
} from '../db/minigolfModeration.js'
import { toApiHole, viewerOf } from './minigolfCourses.js'
import { ApiError, notFound } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

const missing = (r: 'ok' | 'missing') => {
  if (r === 'missing') throw notFound()
}

export function minigolfModerationApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts
  const moderatorOnly = [requireAuth, requireModerator]

  app.get<Route<'browseMinigolfCourses'>>(
    '/api/minigolf/browse',
    { preValidation: requireAuth, schema: fromSpec('browseMinigolfCourses') },
    async req => {
      if (!(await viewerOf(db, req.userId)).userCourses) throw new ApiError(403, { error: 'forbidden' })
      return { courses: (await browseCourses(db, req.query.search)).map(toApiCourse) }
    },
  )

  app.post<Route<'reportMinigolfCourse'>>(
    '/api/minigolf/courses/:id/report',
    { preValidation: requireAuth, schema: fromSpec('reportMinigolfCourse') },
    async (req, reply) => {
      const v = await viewerOf(db, req.userId)
      if (!v.userCourses) throw new ApiError(403, { error: 'forbidden' })
      const course = await getCourse(db, req.params.id)
      // Only a published user course can be reported, and only by someone who may read it
      if (!course || course.visibility !== 'public' || !canReadCourse(course, v)) throw notFound()
      if (course.ownerUserId === req.userId) throw new ApiError(409, { error: 'your own course' })
      const reason = req.body.reason.trim()
      if (!reason) throw new ApiError(400, { error: 'invalid request', details: [{ path: 'body/reason', message: 'must not be blank' }] })
      if ((await reportCourse(db, course.id, req.userId, reason)) === 'duplicate') throw new ApiError(409, { error: 'already reported' })
      return reply.code(204).send()
    },
  )

  app.get<Route<'listMinigolfReports'>>(
    '/api/admin/minigolf/reports',
    { preValidation: moderatorOnly, schema: fromSpec('listMinigolfReports') },
    async () => ({
      courses: (await listReportedCourses(db)).map(c => ({
        course: toApiCourse(c.course),
        reports: c.reports.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
      })),
      moderated: (await listModeratedCourses(db)).map(m => ({ ...m, at: m.at.toISOString() })),
    }),
  )

  app.post<Route<'moderateUnpublishMinigolfCourse'>>(
    '/api/admin/minigolf/courses/:id/unpublish',
    { preValidation: moderatorOnly, schema: fromSpec('moderateUnpublishMinigolfCourse') },
    async (req, reply) => {
      missing(await moderatorUnpublish(db, req.userId, req.params.id, requireReason(req.body.reason)))
      return reply.code(204).send()
    },
  )

  app.post<Route<'removeMinigolfCourse'>>(
    '/api/admin/minigolf/courses/:id/remove',
    { preValidation: moderatorOnly, schema: fromSpec('removeMinigolfCourse') },
    async (req, reply) => {
      missing(await moderatorRemove(db, req.userId, req.params.id, requireReason(req.body.reason)))
      return reply.code(204).send()
    },
  )

  app.post<Route<'dismissMinigolfReports'>>(
    '/api/admin/minigolf/courses/:id/dismiss-reports',
    { preValidation: moderatorOnly, schema: fromSpec('dismissMinigolfReports') },
    async (req, reply) => {
      missing(await moderatorDismiss(db, req.userId, req.params.id))
      return reply.code(204).send()
    },
  )

  app.post<Route<'allowMinigolfCoursePublish'>>(
    '/api/admin/minigolf/courses/:id/allow',
    { preValidation: moderatorOnly, schema: fromSpec('allowMinigolfCoursePublish') },
    async (req, reply) => {
      missing(await moderatorAllow(db, req.userId, req.params.id))
      return reply.code(204).send()
    },
  )

  done()
}

const toApiCourse = (c: BrowseCourse) => ({ ...c, thumbnail: toApiHole(c.thumbnail) })

function requireReason(reason: string): string {
  const trimmed = reason.trim()
  if (!trimmed) throw new ApiError(400, { error: 'invalid request', details: [{ path: 'body/reason', message: 'must not be blank' }] })
  return trimmed
}
