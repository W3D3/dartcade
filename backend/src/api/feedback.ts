import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { getAccount } from '../db/users.js'
import { feedbackMail } from '../mail/templates.js'
import type { Mailer } from '../mail/transport.js'
import { ApiError } from './errors.js'
import { looksLikeJpeg } from './me.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

/** The report with its base64 screenshot: the browser sends a downscaled JPEG well under this. */
const FEEDBACK_BODY_LIMIT = 3 * 1024 * 1024

/** Where reports go: FEEDBACK_EMAIL, else the operator's legal contact; null turns reporting off. */
export function feedbackAddress(env: Record<string, string | undefined>): string | null {
  return env.FEEDBACK_EMAIL?.trim() || env.LEGAL_CONTACT_EMAIL?.trim() || null
}

type Opts = FastifyPluginOptions & { db: Kysely<Database>; mailer: Mailer | null; to: string | null }

/** POST /api/feedback: a signed-in user's bug report or idea, mailed to the operator. */
export function feedbackApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db, mailer, to } = opts

  app.post<Route<'sendFeedback'>>(
    '/api/feedback',
    {
      preValidation: requireAuth,
      schema: fromSpec('sendFeedback'),
      bodyLimit: FEEDBACK_BODY_LIMIT,
      // After auth, so it counts per user, not per address
      config: { rateLimit: { max: 5, timeWindow: '1 hour', hook: 'preHandler', keyGenerator: req => req.userId } },
    },
    async (req, reply) => {
      if (!mailer || !to) throw new ApiError(503, { error: 'reporting is unavailable on this server' })
      const { kind, message, context, screenshot } = req.body
      if (!message.trim()) throw new ApiError(400, { error: 'message is empty' })
      const image = screenshot === undefined ? null : Buffer.from(screenshot, 'base64')
      if (image && !looksLikeJpeg(image)) throw new ApiError(400, { error: 'screenshot is not a JPEG' })
      const account = await getAccount(db, req.userId)
      if (!account) throw new ApiError(401, { error: 'unauthorized' })
      // The account comes from the database, everything else as the browser reported it
      const details: [string, string][] = [
        ['User id', account.id],
        ['Name', account.name],
        ['Email', account.email],
        ['Role', account.role ?? 'user'],
        ['Page', context.route],
        ['Game', context.sessionId ?? 'none'],
        ['App version', `${context.version}${context.commit ? ` (${context.commit})` : ''}`],
        ['Browser', context.userAgent],
        ['Viewport', context.viewport],
        ['Locale', context.locale],
        ['Sent at', new Date().toISOString()],
      ]
      mailer.send(feedbackMail(to, kind, account.name, message.trim(), details, image))
      return reply.code(204).send()
    },
  )
  done()
}
