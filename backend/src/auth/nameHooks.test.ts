import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { nameHooks } from './nameHooks.js'
import { insertUsers } from '../test/fixtures.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('better-auth name hooks', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let hooks: ReturnType<typeof nameHooks>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('name_hooks_test'))
    await insertUsers(db, [{ id: 'luke', name: 'Luke' }])
    hooks = nameHooks(db)
  })
  afterAll(async () => {
    await close()
  })

  const signUpCtx = { path: '/sign-up/email' } as Parameters<typeof hooks.user.create.before>[1]

  it('stores a sign-up name normalized, and records when the terms were accepted', async () => {
    const result = await hooks.user.create.before({ name: ' Jürgen ', email: 'j@example.com' }, signUpCtx)
    expect(result).toMatchObject({ data: { name: 'Jürgen', email: 'j@example.com' } })
    expect(result.data.termsAcceptedAt).toBeInstanceOf(Date)
  })

  it("doesn't stamp terms acceptance for a user created some other way (e.g. the admin plugin)", async () => {
    const result = await hooks.user.create.before({ name: 'RobCross', email: 'rc@example.com' }, {
      path: '/admin/create-user',
    } as Parameters<typeof hooks.user.create.before>[1])
    expect(result.data).not.toHaveProperty('termsAcceptedAt')
  })

  it('refuses a sign-up name that is taken in another case, or breaks the rules', async () => {
    await expect(hooks.user.create.before({ name: 'LUKE' }, signUpCtx)).rejects.toMatchObject({ body: { message: 'That name is taken' } })
    await expect(hooks.user.create.before({ name: 'Phil Taylor' }, signUpCtx)).rejects.toMatchObject({
      body: { message: expect.stringContaining('no spaces') },
    })
  })

  const socialCtx = { path: '/callback/:id' } as Parameters<typeof hooks.user.create.before>[1]

  it('records the terms for a social sign-up too, whose name already fits (discord.ts)', async () => {
    const result = await hooks.user.create.before({ name: 'luke2', email: 'l2@example.com' }, socialCtx)
    expect(result.data).toMatchObject({ name: 'luke2' })
    expect(result.data.termsAcceptedAt).toBeInstanceOf(Date)
  })

  it("lets better-auth's update-user change anything but the name", async () => {
    await expect(hooks.user.update.before({ emailVerified: true })).resolves.toBeUndefined()
    await expect(hooks.user.update.before({ name: 'Luke2' })).rejects.toMatchObject({ body: { message: 'Change your name in Settings' } })
  })

  describe('country', () => {
    type Ctx = Parameters<typeof hooks.user.create.before>[1]
    type Given = { name: string; country?: string | null }
    const withCountry = (user: Given, ctx: Ctx) => nameHooks(db, () => Promise.resolve('AT')).user.create.before(user, ctx)
    const ctx = (path: string) => ({ path, headers: new Headers() }) as Ctx

    it('is set for an email and a social sign-up', async () => {
      expect((await withCountry({ name: 'Cea' }, ctx('/sign-up/email'))).data.country).toBe('AT')
      expect((await withCountry({ name: 'Ceb' }, ctx('/callback/:id'))).data.country).toBe('AT')
    })
    it('never overwrites one already given', async () => {
      expect((await withCountry({ name: 'Cec', country: 'FR' }, ctx('/sign-up/email'))).data.country).toBe('FR')
    })
    it('is not set when nothing resolves, or for an admin-created user', async () => {
      expect((await hooks.user.create.before({ name: 'Ced' }, ctx('/sign-up/email'))).data).not.toHaveProperty('country')
      expect((await withCountry({ name: 'Cee' }, ctx('/admin/create-user'))).data).not.toHaveProperty('country')
      expect((await withCountry({ name: 'Cef' }, null)).data).not.toHaveProperty('country')
    })
  })
})
