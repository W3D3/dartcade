import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { nameHooks } from './nameHooks.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('better-auth name hooks', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let hooks: ReturnType<typeof nameHooks>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('name_hooks_test'))
    await db.insertInto('user').values({ id: 'luke', name: 'Luke', email: 'luke@example.com', emailVerified: false, image: null }).execute()
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

  it('fits a Discord name to the rules and numbers it when taken, never refusing it, and records the terms', async () => {
    const taken = await hooks.user.create.before({ name: 'luke', email: 'l2@example.com' }, socialCtx)
    expect(taken.data.name).toBe('luke2')
    expect(taken.data.termsAcceptedAt).toBeInstanceOf(Date)
    const odd = await hooks.user.create.before({ name: 'Mighty Mike ✨ the Great Darts Legend', email: 'm@example.com' }, socialCtx)
    expect(odd.data.name).toBe('Mighty.Mike.the.Grea')
    const short = await hooks.user.create.before({ name: 'x', email: 'x@example.com' }, socialCtx)
    expect(short.data.name).toBe('player')
  })

  it('refuses a .invalid email (Discord accounts without one use it) anywhere but a social sign-in', async () => {
    await expect(hooks.user.create.before({ name: 'Imposter', email: '42@discord.invalid' }, signUpCtx)).rejects.toMatchObject({
      body: { message: 'Use a real email address' },
    })
    await expect(hooks.user.create.before({ name: 'Phoneonly', email: '42@discord.invalid' }, socialCtx)).resolves.toMatchObject({
      data: { email: '42@discord.invalid' },
    })
  })

  it("lets better-auth's update-user change anything but the name", async () => {
    await expect(hooks.user.update.before({ emailVerified: true })).resolves.toBeUndefined()
    await expect(hooks.user.update.before({ name: 'Luke2' })).rejects.toMatchObject({ body: { message: 'Change your name in Settings' } })
  })
})
