import type { Kysely } from 'kysely'
import { APIError } from 'better-auth/api'
import type { GenericEndpointContext } from '@better-auth/core'
import type { Database } from '../db/schema.js'
import { NAME_TAKEN, checkName } from '../users/account.js'
import { NAME_RULE } from '../users/names.js'
import { signUpKind } from './termsGate.js'

/**
 * better-auth's user hooks. Sign-up follows the name rules, stores the name normalized, and
 * records when the terms were accepted (termsGate.ts refuses an email sign-up without
 * acceptTerms first; a social sign-in accepts by continuing) — only for a real sign-up, not e.g.
 * the admin plugin's own create-user, which makes accounts nobody has accepted anything for. A
 * Discord name arrives already fitted to the rules and free (discord.ts). better-auth's own
 * update-user can't change the name: names change through PATCH /api/me, which checks them.
 */
export function nameHooks(db: Kysely<Database>) {
  return {
    user: {
      create: {
        before: async <U extends { name: string }>(user: U, ctx: GenericEndpointContext | null) => {
          const check = await checkName(db, user.name, null)
          if (!check.ok) {
            throw new APIError('BAD_REQUEST', { message: check.reason === 'taken' ? NAME_TAKEN : `Names are ${NAME_RULE}` })
          }
          // Omit the field rather than set it undefined for every other creator (e.g. the admin
          // plugin's create-user): an explicit undefined would still reach the adapter's insert.
          const stamp = signUpKind(ctx) ? { termsAcceptedAt: new Date() } : {}
          return { data: { ...user, name: check.name, ...stamp } }
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
