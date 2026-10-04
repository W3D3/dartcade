import type { Kysely } from 'kysely'
import { APIError } from 'better-auth/api'
import type { Database } from '../db/schema.js'
import { NAME_TAKEN, checkName } from '../users/account.js'
import { NAME_RULE } from '../users/names.js'

/**
 * better-auth's user hooks. Sign-up follows the name rules and stores the name normalized.
 * better-auth's own update-user can't change the name: names change through PATCH /api/me,
 * which checks them.
 */
export function nameHooks(db: Kysely<Database>) {
  return {
    user: {
      create: {
        before: async <U extends { name: string }>(user: U) => {
          const check = await checkName(db, user.name, null)
          if (!check.ok) {
            throw new APIError('BAD_REQUEST', { message: check.reason === 'taken' ? NAME_TAKEN : `Names are ${NAME_RULE}` })
          }
          return { data: { ...user, name: check.name } }
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
