import { createAuthMiddleware, APIError, isAPIError } from 'better-auth/api'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { activeBan, BAN_CATEGORIES } from '../shared/bans.js'

/**
 * A banned player's sign-in: better-auth's admin plugin refuses it (BANNED_USER) with one generic
 * message. This adds the ban's public category and end, for Login to explain. The plugin refuses
 * only after the password matched, so nobody learns of a ban without it. Never the admin's note.
 */
export const bannedSignIn = (db: Kysely<Database>) =>
  createAuthMiddleware(async ctx => {
    if (ctx.path !== '/sign-in/email') return
    const refused: unknown = ctx.context.returned
    if (!isAPIError(refused) || refused.body?.code !== 'BANNED_USER') return
    const body: unknown = ctx.body
    const email = body && typeof body === 'object' && 'email' in body && typeof body.email === 'string' ? body.email : null
    // better-auth stores emails lower-cased
    const user = email
      ? await db
          .selectFrom('user')
          .select(['banned', 'banReason', 'banExpires'])
          .where('email', '=', email.toLowerCase())
          .executeTakeFirst()
      : undefined
    const ban = user && activeBan(user)
    if (!ban) return
    throw new APIError('FORBIDDEN', {
      code: 'BANNED_USER',
      message: BAN_CATEGORIES[ban.category],
      category: ban.category,
      until: ban.until?.toISOString() ?? null,
    })
  })
