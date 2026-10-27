import type { Kysely } from 'kysely'
import { APIError } from 'better-auth/api'
import type { GenericEndpointContext } from '@better-auth/core'
import type { Database } from '../db/schema.js'
import { NAME_TAKEN, checkName, suggestName } from '../users/account.js'
import { NAME_RULE } from '../users/names.js'
import { undeliverable } from '../mail/transport.js'

/** better-auth's OAuth callback route (`/callback/discord`), where a social sign-in creates its user. */
export const SOCIAL_CALLBACK = '/callback/:id'

/**
 * better-auth's user hooks. Sign-up follows the name rules, stores the name normalized, and
 * records when the terms were accepted (termsGate.ts refuses sign-up without acceptTerms first) —
 * only for a real sign-up, not e.g. the admin plugin's own create-user, which makes accounts
 * nobody has accepted anything for. A social sign-in (Sign in with Discord) accepts the terms by
 * continuing, and its name, which nobody typed, is made to fit instead of refused. better-auth's
 * own update-user can't change the name: names change through PATCH /api/me, which checks them.
 */
export function nameHooks(db: Kysely<Database>) {
  return {
    user: {
      create: {
        before: async <U extends { name: string; email?: string }>(user: U, ctx: GenericEndpointContext | null) => {
          const social = ctx?.path === SOCIAL_CALLBACK
          // .invalid stands in for a Discord account's missing email; nobody else may take one
          if (!social && user.email !== undefined && undeliverable(user.email))
            throw new APIError('BAD_REQUEST', { message: 'Use a real email address' })
          let name: string
          if (social) name = await suggestName(db, user.name, null)
          else {
            const check = await checkName(db, user.name, null)
            if (!check.ok) {
              throw new APIError('BAD_REQUEST', { message: check.reason === 'taken' ? NAME_TAKEN : `Names are ${NAME_RULE}` })
            }
            name = check.name
          }
          // Omit the field rather than set it undefined for every other creator (e.g. the admin
          // plugin's create-user): an explicit undefined would still reach the adapter's insert.
          const stamp = social || ctx?.path === '/sign-up/email' ? { termsAcceptedAt: new Date() } : {}
          return { data: { ...user, name, ...stamp } }
        },
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/require-await -- async so a throw rejects the Promise better-auth awaits, not throws synchronously
        before: async (data: Record<string, unknown>): Promise<void> => {
          if (data.name !== undefined) throw new APIError('BAD_REQUEST', { message: 'Change your name in Settings' })
        },
      },
    },
  }
}
