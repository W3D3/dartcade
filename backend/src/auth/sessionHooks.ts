import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { lastLoginHooks } from './lastLogin.js'

type Log = { error(msg: string, err: unknown): void }

/**
 * better-auth's session hooks. A sign-in stamps last_login_at (lastLogin.ts). An admin's
 * impersonation session (impersonatedBy set) is not a sign-in of the user it shows: it leaves their
 * last login alone and writes an admin_audit row instead. A failed audit write is logged, never thrown.
 */
export function sessionHooks(db: Kysely<Database>, log: Log = console) {
  const stampLastLogin = lastLoginHooks(db, log).session.create.after
  return {
    session: {
      create: {
        after: async (session: { userId: string; impersonatedBy?: string | null }): Promise<void> => {
          if (typeof session.impersonatedBy !== 'string') return stampLastLogin(session)
          try {
            await db
              .insertInto('admin_audit')
              .values({ admin_user_id: session.impersonatedBy, action: 'user.impersonate', target: session.userId })
              .execute()
          } catch (err) {
            log.error('Failed to audit impersonation', err)
          }
        },
      },
    },
  }
}
