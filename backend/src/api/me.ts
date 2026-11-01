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
  setCountry,
  setInvisible,
  updatePreferences,
  UnknownAvatarFinishError,
} from '../db/users.js'
import { renameUser, suggestName } from '../users/account.js'
import { hasPerk, unlockedPictures } from '../db/progression.js'
import { AVATAR_FINISHES, isAvatarFinish } from '../shared/avatarFinishes.js'
import { isCountryCode } from '../shared/countries.js'
import { pictureFor } from '../shared/progression.js'
import { ApiError } from './errors.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & {
  db: Kysely<Database>
  /** Name, Invisible or avatar changed: friends see it. */
  onChanged?: (userId: string) => void
  /** The avatar changed: their open lobby shows it. */
  onAvatarChanged?: (userId: string) => Promise<void>
  /** Name changed: their row in their open lobby follows it. */
  onRenamed?: (userId: string, name: string) => Promise<void>
}

/** The largest upload accepted; the browser resizes to a ~256x256 JPEG first, so this is a safety net. */
const AVATAR_UPLOAD_LIMIT = 512 * 1024

/** A buffer's magic bytes say it's a JPEG (SOI ... EOI) — no image library needed just to check this. */
export function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9
}

/** Fastify leaves the body undefined for a request without one: that reads as an empty file (not a JPEG). */
const orEmpty = (body: Buffer | undefined): Buffer => body ?? Buffer.alloc(0)

/** The signed-in account: GET shows it, PATCH changes the name or Invisible. */
export function meApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  const progressionOn = async (userId: string) => flagEnabled('progression.enabled', await loadFlagUser(db, userId))

  async function me(userId: string, impersonating: boolean) {
    const account = await getAccount(db, userId)
    if (!account) throw new ApiError(404, { error: 'account not found' })
    const { role, ...rest } = account
    return {
      ...rest,
      isAdmin: isAdmin({ role }),
      isModerator: isModerator({ role }),
      impersonating,
      suggestedName: account.nameNeedsChange ? await suggestName(db, account.name, account.id) : null,
      // Pictures are rewards only while progression is on
      pictures: (await progressionOn(userId)) ? await unlockedPictures(db, userId) : AVATAR_FINISHES.map(f => f.id),
    }
  }

  app.get<Route<'getMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('getMe') }, async req =>
    me(req.userId, typeof req.impersonatedBy === 'string'),
  )

  app.patch<Route<'updateMe'>>('/api/me', { preValidation: requireAuth, schema: fromSpec('updateMe') }, async req => {
    if (req.body.name !== undefined) {
      const name = await renameUser(db, req.userId, req.body.name)
      await opts.onRenamed?.(req.userId, name)
    }
    if (req.body.invisible !== undefined) await setInvisible(db, req.userId, req.body.invisible)
    if (req.body.country !== undefined) {
      if (req.body.country !== null && !isCountryCode(req.body.country)) throw new ApiError(400, { error: 'unknown country' })
      await setCountry(db, req.userId, req.body.country)
    }
    if (req.body.avatar !== undefined) {
      // A picture is a reward: a finish not unlocked yet can't be worn on either layer (unknown ones are setAvatar's 400)
      const { avatar } = req.body
      const layers = avatar.kind === 'preset' ? [avatar.foreground, avatar.background] : []
      if (layers.length > 0 && layers.every(id => id !== undefined && isAvatarFinish(id)) && (await progressionOn(req.userId)))
        for (const id of new Set(layers))
          if (id && !(await hasPerk(db, req.userId, pictureFor(id))))
            throw new ApiError(409, { error: `avatar finish not unlocked yet: ${id}` })
      try {
        await setAvatar(db, req.userId, avatar)
      } catch (err) {
        if (err instanceof UnknownAvatarFinishError) throw new ApiError(400, { error: `unknown avatar finish: ${err.message}` })
        throw err
      }
      await opts.onAvatarChanged?.(req.userId)
    }
    opts.onChanged?.(req.userId)
    return me(req.userId, typeof req.impersonatedBy === 'string')
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
        await opts.onAvatarChanged?.(req.userId)
        opts.onChanged?.(req.userId)
        return me(req.userId, typeof req.impersonatedBy === 'string')
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
      const { equipped: _equipped, ...changes } = req.body
      return (await updatePreferences(db, req.userId, changes)) ?? {}
    },
  )

  done()
}
