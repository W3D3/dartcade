import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

type Log = { error(msg: string, err: unknown): void }

/**
 * better-auth's session hooks. Stamps last_login_at on every sign-in; a failure here must not
 * fail the sign-in itself, so it's caught and logged instead of thrown.
 */
export function lastLoginHooks(db: Kysely<Database>, log: Log = console) {
  return {
    session: {
      create: {
        after: async (session: { userId: string }): Promise<void> => {
          try {
            await db.updateTable('user').set({ last_login_at: new Date() }).where('id', '=', session.userId).execute()
          } catch (err) {
            log.error('Failed to set last_login_at', err)
          }
        },
      },
    },
  }
}
