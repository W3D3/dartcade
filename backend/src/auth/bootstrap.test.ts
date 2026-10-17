import { describe, it, expect, vi } from 'vitest'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { admin } from 'better-auth/plugins'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { nameHooks } from './nameHooks.js'
import { bootstrapAdmin } from './bootstrap.js'

// Mirrors auth/index.ts's config (minus trusted origins and the OpenAPI plugin, which don't
// affect signUpEmail's return shape) so it type-checks against bootstrapAdmin's default signUp.
function createTestAuth(db: Kysely<Database>) {
  return betterAuth({
    database: { db, type: 'pg' as const },
    emailAndPassword: { enabled: true },
    databaseHooks: nameHooks(db),
    advanced: { database: { validateSchema: false } },
    plugins: [admin()],
  })
}
type TestAuth = ReturnType<typeof createTestAuth>
type SignUp = (body: { email: string; password: string; name: string }) => ReturnType<TestAuth['api']['signUpEmail']>
type SignIn = (body: { email: string; password: string }) => ReturnType<TestAuth['api']['signInEmail']>

// Opens a fresh schema with its own better-auth instance, so each case starts from a clean
// "no admin" state without the account churn of earlier cases leaking in.
async function withSchema(
  name: string,
  run: (ctx: { db: Kysely<Database>; auth: TestAuth; signUp: SignUp; signIn: SignIn }) => Promise<void>,
) {
  const { db, close } = await openTestSchema(name)
  try {
    const auth = createTestAuth(db)
    const signUp: SignUp = body => auth.api.signUpEmail({ body })
    const signIn: SignIn = body => auth.api.signInEmail({ body })
    await run({ db, auth, signUp, signIn })
  } finally {
    await close()
  }
}

function mockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

// Asserts the password never appears in any logged message, across every call made to the spy.
function assertPasswordNotLogged(log: ReturnType<typeof mockLog>, password: string) {
  for (const spy of [log.info, log.warn, log.error]) {
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain(password)
  }
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('bootstrapAdmin', () => {
  it('does nothing without env', async () => {
    await withSchema('bootstrap_no_env', async ({ db, signUp }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, {}, log, signUp)).resolves.toBe('skipped')
      expect(await db.selectFrom('user').select('id').execute()).toEqual([])
    })
  })

  it('skips and warns when only the email is set', async () => {
    await withSchema('bootstrap_only_email', async ({ db, signUp }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, { email: 'a@x.com' }, log, signUp)).resolves.toBe('skipped')
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'))
      expect(await db.selectFrom('user').select('id').execute()).toEqual([])
    })
  })

  it('skips and warns when only the password is set', async () => {
    await withSchema('bootstrap_only_password', async ({ db, signUp }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, { password: 'password123' }, log, signUp)).resolves.toBe('skipped')
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_EMAIL'))
      assertPasswordNotLogged(log, 'password123')
    })
  })

  it('skips and errors when the password is too short', async () => {
    await withSchema('bootstrap_short_password', async ({ db, signUp }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, { email: 'a@x.com', password: 'short12' }, log, signUp)).resolves.toBe('skipped')
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'))
      expect(await db.selectFrom('user').select('id').execute()).toEqual([])
      assertPasswordNotLogged(log, 'short12')
    })
  })

  it('creates the admin when no admin and no account exist', async () => {
    await withSchema('bootstrap_created', async ({ db, auth, signUp }) => {
      const log = mockLog()
      const password = 'password123'
      await expect(bootstrapAdmin(db, { email: 'New@Example.com', password }, log, signUp)).resolves.toBe('created')
      const row = await db.selectFrom('user').select(['email', 'role']).where('email', '=', 'new@example.com').executeTakeFirstOrThrow()
      expect(row.role).toBe('admin')
      const signIn = await auth.api.signInEmail({ body: { email: 'new@example.com', password } })
      expect(signIn.user.email).toBe('new@example.com')
      assertPasswordNotLogged(log, password)
    })
  })

  it('skips instead of crashing startup when signUp rejects', async () => {
    await withSchema('bootstrap_signup_rejects', async ({ db }) => {
      const log = mockLog()
      const password = 'password123'
      const failingSignUp = vi.fn(() => Promise.reject(new APIError('UNPROCESSABLE_ENTITY', { message: 'That name is taken' })))
      await expect(bootstrapAdmin(db, { email: 'new@example.com', password }, log, failingSignUp)).resolves.toBe('skipped')
      expect(log.error).toHaveBeenCalledTimes(1)
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('That name is taken'))
      expect(await db.selectFrom('user').select('id').where('role', '=', 'admin').executeTakeFirst()).toBeUndefined()
      expect(await db.selectFrom('user').select('id').where('email', '=', 'new@example.com').executeTakeFirst()).toBeUndefined()
      assertPasswordNotLogged(log, password)
    })
  })

  it('promotes an existing account when ADMIN_PASSWORD signs into it', async () => {
    await withSchema('bootstrap_promoted', async ({ db, auth, signIn }) => {
      const password = 'originalPassword1'
      await auth.api.signUpEmail({ body: { email: 'owner@example.com', password, name: 'Owner' } })

      const log = mockLog()
      const neverSignUp = vi.fn(() => {
        throw new Error('signUp should not be called when promoting an existing account')
      })
      await expect(bootstrapAdmin(db, { email: 'Owner@Example.com', password }, log, neverSignUp, signIn)).resolves.toBe('promoted')
      expect(neverSignUp).not.toHaveBeenCalled()
      const row = await db.selectFrom('user').select('role').where('email', '=', 'owner@example.com').executeTakeFirstOrThrow()
      expect(row.role).toBe('admin')
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('existing account'))
      assertPasswordNotLogged(log, password)
    })
  })

  it("doesn't promote an existing account when ADMIN_PASSWORD doesn't sign into it", async () => {
    await withSchema('bootstrap_wrong_password', async ({ db, auth, signIn }) => {
      await auth.api.signUpEmail({ body: { email: 'owner@example.com', password: 'originalPassword1', name: 'Owner' } })

      const log = mockLog()
      const neverSignUp = vi.fn(() => {
        throw new Error('signUp should not be called for an existing account')
      })
      await expect(
        bootstrapAdmin(db, { email: 'owner@example.com', password: 'differentPassword1' }, log, neverSignUp, signIn),
      ).resolves.toBe('skipped')
      expect(neverSignUp).not.toHaveBeenCalled()
      const row = await db.selectFrom('user').select('role').where('email', '=', 'owner@example.com').executeTakeFirstOrThrow()
      expect(row.role).not.toBe('admin')
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('docs/SELFHOSTING.md'))
      assertPasswordNotLogged(log, 'differentPassword1')
    })
  })

  it('cleans the name it derives from the email', async () => {
    await withSchema('bootstrap_name_cleaned', async ({ db, signUp, signIn }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, { email: 'a.b+tag@x.com', password: 'password123' }, log, signUp, signIn)).resolves.toBe('created')
      const row = await db.selectFrom('user').select(['name', 'role']).where('email', '=', 'a.b+tag@x.com').executeTakeFirstOrThrow()
      expect(row).toEqual({ name: 'a.btag', role: 'admin' })
    })
  })

  it('falls back to "admin" when the email leaves too little for a name', async () => {
    await withSchema('bootstrap_name_short', async ({ db, signUp, signIn }) => {
      const log = mockLog()
      await expect(bootstrapAdmin(db, { email: 'a@x.com', password: 'password123' }, log, signUp, signIn)).resolves.toBe('created')
      const row = await db.selectFrom('user').select('name').where('email', '=', 'a@x.com').executeTakeFirstOrThrow()
      expect(row.name).toBe('admin')
    })
  })

  it('picks a free name when the derived one is taken', async () => {
    await withSchema('bootstrap_name_taken', async ({ db, auth, signUp, signIn }) => {
      await auth.api.signUpEmail({ body: { email: 'someone@example.com', password: 'password123', name: 'owner' } })
      const log = mockLog()
      await expect(bootstrapAdmin(db, { email: 'owner@x.com', password: 'password123' }, log, signUp, signIn)).resolves.toBe('created')
      const row = await db.selectFrom('user').select(['name', 'role']).where('email', '=', 'owner@x.com').executeTakeFirstOrThrow()
      expect(row).toEqual({ name: 'owner2', role: 'admin' })
    })
  })

  it('does nothing when an admin already exists, even under another email', async () => {
    await withSchema('bootstrap_exists', async ({ db, auth }) => {
      await auth.api.signUpEmail({ body: { email: 'other-admin@example.com', password: 'password123', name: 'Other' } })
      await db.updateTable('user').set({ role: 'admin' }).where('email', '=', 'other-admin@example.com').execute()

      const log = mockLog()
      const neverSignUp = vi.fn(() => {
        throw new Error('signUp should not be called when an admin already exists')
      })
      await expect(bootstrapAdmin(db, { email: 'new@example.com', password: 'password123' }, log, neverSignUp)).resolves.toBe('exists')
      expect(neverSignUp).not.toHaveBeenCalled()
      expect(await db.selectFrom('user').select('id').where('email', '=', 'new@example.com').executeTakeFirst()).toBeUndefined()
    })
  })
})
