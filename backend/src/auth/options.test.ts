import { describe, it, expect, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { DiscordProfile } from 'better-auth/social-providers'
import { authOptions } from './options.js'
import { discordName, discordProvider, resolveDiscordConfig } from './discord.js'

// A free name as is: discordSignIn.test.ts numbers taken ones against a real database
vi.mock('../users/account.js', () => ({ suggestName: (_db: unknown, name: string) => Promise.resolve(name) }))

const deps = () => ({
  db: {} as Kysely<Database>,
  mail: { smtpUrl: null, from: null, verification: false } as const,
  mailer: null,
  trustedOrigins: [],
})

describe('authOptions', () => {
  it('reads the client IP only from the header the /api/auth/* handler sets (never a client-sent one by default)', () => {
    expect(authOptions(deps()).advanced.ipAddress.ipAddressHeaders).toEqual(['x-dartcade-client-ip'])
  })

  it("doesn't override better-auth's own default for whether the rate limiter is on", () => {
    expect(authOptions(deps()).rateLimit).not.toHaveProperty('enabled')
  })
})

describe('Sign in with Discord', () => {
  it('is off without its credentials', () => {
    expect(authOptions(deps()).socialProviders).toEqual({})
    expect(resolveDiscordConfig({})).toBeNull()
    expect(resolveDiscordConfig({ DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: ' ' })).toBeNull()
  })

  it('is on with both, and refuses to start with only one', () => {
    const discord = resolveDiscordConfig({ DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'secret' })
    expect(authOptions({ ...deps(), discord }).socialProviders).toMatchObject({ discord: { clientId: 'id', clientSecret: 'secret' } })
    expect(() => resolveDiscordConfig({ DISCORD_CLIENT_ID: 'id' })).toThrow(/DISCORD_CLIENT_SECRET/)
  })

  it("never trusts Discord to link accounts without a verified email (better-auth's default)", () => {
    const options = authOptions({ ...deps(), discord: { clientId: 'id', clientSecret: 'secret' } })
    expect(options).not.toHaveProperty('account.accountLinking.trustedProviders')
  })
})

describe('the Discord profile', () => {
  const map = (profile: Partial<DiscordProfile>) =>
    discordProvider({ clientId: 'id', clientSecret: 'secret' }, deps().db).mapProfileToUser!({
      id: '42',
      username: 'annie',
      global_name: null,
      ...profile,
    } as DiscordProfile)

  it('names the account after the display name, else the username, cut to the name rules', () => {
    expect(discordName({ global_name: 'Annie Darts', username: 'annie' })).toBe('Annie.Darts')
    expect(discordName({ global_name: null, username: 'annie_99' })).toBe('annie_99')
    expect(discordName({ global_name: '🎯', username: 'annie' })).toBe('annie')
    expect(discordName({ global_name: '🎯', username: 'x' })).toBe('player')
    expect(discordName({ global_name: 'A very long display name indeed', username: 'x' })).toBe('A.very.long.display.')
  })

  it('gives an account without an email an unverified .invalid stand-in', async () => {
    expect(await map({ email: null, verified: false })).toMatchObject({ name: 'annie', email: '42@discord.invalid', emailVerified: false })
    expect(await map({ email: 'annie@example.org', verified: true })).not.toHaveProperty('email')
  })
})
