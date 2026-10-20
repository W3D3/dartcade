import { describe, it, expect } from 'vitest'
import { betterAuth } from 'better-auth'
import { sql } from 'kysely'
import { admin } from 'better-auth/plugins'
import { openTestSchema } from '../db/testSchema.js'
import { sessionHooks } from './sessionHooks.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('session hooks for impersonation', () => {
  it("audits an admin's impersonation session and leaves the user's last login alone", async () => {
    const { db, close } = await openTestSchema('session_hooks_test')
    try {
      const auth = betterAuth({
        database: { db, type: 'pg' as const },
        emailAndPassword: { enabled: true },
        databaseHooks: { ...sessionHooks(db) },
        advanced: { database: { validateSchema: false } },
        plugins: [admin()],
      })
      await auth.api.signUpEmail({ body: { email: 'boss@example.com', password: 'password123', name: 'Boss' } })
      await auth.api.signUpEmail({ body: { email: 'pat@example.com', password: 'password123', name: 'Pat' } })
      await db.updateTable('user').set({ role: 'admin' }).where('email', '=', 'boss@example.com').execute()
      const pat = await db
        .selectFrom('user')
        .select(['id', 'last_login_at'])
        .where('email', '=', 'pat@example.com')
        .executeTakeFirstOrThrow()
      const boss = await db.selectFrom('user').select('id').where('email', '=', 'boss@example.com').executeTakeFirstOrThrow()

      const signedIn = await auth.api.signInEmail({ body: { email: 'boss@example.com', password: 'password123' }, returnHeaders: true })
      const cookie = signedIn.headers
        .getSetCookie()
        .map(c => c.split(';')[0])
        .join('; ')
      await auth.api.impersonateUser({ body: { userId: pat.id }, headers: new Headers({ cookie }) })

      const { rows } = await sql<{
        impersonatedBy: string
      }>`SELECT "impersonatedBy" FROM session WHERE "userId" = ${pat.id} AND "impersonatedBy" IS NOT NULL`.execute(db)
      const session = rows[0]
      expect(session.impersonatedBy).toBe(boss.id)
      const after = await db.selectFrom('user').select('last_login_at').where('id', '=', pat.id).executeTakeFirstOrThrow()
      expect(after.last_login_at).toEqual(pat.last_login_at)
      const audit = await db.selectFrom('admin_audit').selectAll().execute()
      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({ admin_user_id: boss.id, action: 'user.impersonate', target: pat.id })
    } finally {
      await close()
    }
  })
})
