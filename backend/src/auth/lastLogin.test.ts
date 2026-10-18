import { describe, it, expect, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { nameHooks } from './nameHooks.js'
import { lastLoginHooks } from './lastLogin.js'

// Mirrors auth/index.ts's databaseHooks merge, minus trusted origins and plugins that don't
// affect sign-in/sign-up.
function createTestAuth(db: Kysely<Database>, log?: Parameters<typeof lastLoginHooks>[1]) {
  return betterAuth({
    database: { db, type: 'pg' as const },
    emailAndPassword: { enabled: true },
    databaseHooks: { ...nameHooks(db), ...lastLoginHooks(db, log) },
    advanced: { database: { validateSchema: false } },
  })
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('last-login hook', () => {
  it('stamps last_login_at on sign-up (which also creates a session), and bumps it on sign-in', async () => {
    const { db, close } = await openTestSchema('last_login_signin_test')
    try {
      const auth = createTestAuth(db)
      await auth.api.signUpEmail({ body: { email: 'jo@example.com', password: 'password123', name: 'Jo' } })

      const first = await db.selectFrom('user').select('last_login_at').where('email', '=', 'jo@example.com').executeTakeFirstOrThrow()
      expect(first.last_login_at).toBeInstanceOf(Date)

      await new Promise(r => setTimeout(r, 5))
      await auth.api.signInEmail({ body: { email: 'jo@example.com', password: 'password123' } })
      const second = await db.selectFrom('user').select('last_login_at').where('email', '=', 'jo@example.com').executeTakeFirstOrThrow()
      expect(second.last_login_at!.getTime()).toBeGreaterThan(first.last_login_at!.getTime())
    } finally {
      await close()
    }
  })

  it("doesn't fail the sign-in when the update fails", async () => {
    const { db, close } = await openTestSchema('last_login_failure_test')
    try {
      const log = { error: vi.fn() }
      const auth = createTestAuth(db, log)
      await auth.api.signUpEmail({ body: { email: 'bo@example.com', password: 'password123', name: 'Bo' } })
      await db.schema.alterTable('user').dropColumn('last_login_at').execute()

      await expect(auth.api.signInEmail({ body: { email: 'bo@example.com', password: 'password123' } })).resolves.toMatchObject({
        user: { email: 'bo@example.com' },
      })
      expect(log.error).toHaveBeenCalledWith('Failed to set last_login_at', expect.anything())
    } finally {
      await close()
    }
  })
})
