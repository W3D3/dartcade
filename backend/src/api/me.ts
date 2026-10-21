import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { isAdmin, isModerator } from '../auth/admin.js'
import { requireAuth } from '../auth/middleware.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import {
  getAccount,
  getPreferences,
  setAvatar,
  setAvatarUpload,
  setInvisible,
  updatePreferences,
  UnknownAvatarColorError,
  UnknownAvatarPresetError,
} from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Name, Invisible or avatar changed: friends see it. */
  onChanged?: (userId: string) => void
  /** Name changed: their row in their open lobby follows it. */
  onRenamed?: (userId: string, name: string) => Promise<void>
}

/** The largest upload accepted; the browser resizes to a ~256x256 JPEG first, so this is a safety net. */
const AVATAR_UPLOAD_LIMIT = 512 * 1024

/** A buffer's magic bytes say it's a JPEG (SOI ... EOI) — no image library needed just to check this. */
function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9
}

/** Fastify leaves the body undefined for a request without one: that reads as an empty file (not a JPEG). */
const orEmpty = (body: Buffer | undefined): Buffer => body ?? Buffer.alloc(0)

/** The signed-in account: GET shows it, PATCH changes the name or Invisible. */
export function meApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  async function me(userId: string) {
    const account = await getAccount(db, userId)
    if (!account) throw new ApiError(404, { error: 'account not found' })
    const { role, ...rest } = account
    return {
      ...rest,
      isAdmin: isAdmin({ role }),
      isModerator: isModerator({ role }),
      suggestedName: account.nameNeedsChange ? await suggestName(db, account.name, account.id) : null,
    }
  }

  app.get<Route<'getMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('getMe') }, async req => me(req.userId))

  app.patch<Route<'updateMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('updateMe') }, async req => {
    if (req.body.name !== undefined) {
      const name = await renameUser(db, req.userId, req.body.name)
      await opts.onRenamed?.(req.userId, name)
    }
    if (req.body.invisible !== undefined) await setInvisible(db, req.userId, req.body.invisible)
    if (req.body.avatar !== undefined) {
      try {
        await setAvatar(db, req.userId, req.body.avatar)
      } catch (err) {
        if (err instanceof UnknownAvatarPresetError) throw new ApiError(400, { error: `unknown avatar preset: ${err.message}` })
        if (err instanceof UnknownAvatarColorError) throw new ApiError(400, { error: `unknown avatar color: ${err.message}` })
        throw err
      }
    }
    opts.onChanged?.(req.userId)
    return me(req.userId)
  })

  // Uploads in a scope of their own that takes a JPEG only (as one Buffer); other bodies get a 415
  app.register((scope, _opts, registered) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: AVATAR_UPLOAD_LIMIT }, (_req, body, parsed) => {
      parsed(null, body)
    })

    scope.post<Route<'uploadAvatar'>>(
      '/api/me/avatar',
      {
        preValidation: requireAuth,
        schema: fromSpec('uploadAvatar'),
        bodyLimit: AVATAR_UPLOAD_LIMIT,
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      },
      async req => {
        if (!(await flagEnabled('avatar.upload.enabled', await loadFlagUser(db, req.userId))))
          throw new ApiError(403, { error: 'avatar uploads are disabled' })
        const image = orEmpty(req.body)
        if (!looksLikeJpeg(image)) throw new ApiError(400, { error: 'not a JPEG' })
        await setAvatarUpload(db, req.userId, image, 'image/jpeg')
        opts.onChanged?.(req.userId)
        return me(req.userId)
      },
    )

    registered()
  })

  // Account-wide preferences: the spec checks the body (known keys and types only, unknown keys dropped)
  app.get<Route<'getPreferences'>>('/api/me/preferences', { preValidation: requireAuth, schema: fromSpec('getPreferences') }, async req => {
    return (await getPreferences(db, req.userId)) ?? {}
  })

  app.put<Route<'updatePreferences'>>(
    '/api/me/preferences',
    { preValidation: requireAuth, schema: fromSpec('updatePreferences') },
    async req => {
      return (await updatePreferences(db, req.userId, req.body)) ?? {}
    },
  )

  done()
}
