import { describe, it, expect } from 'vitest'
import { createFastify } from './fastify.js'
import { authInfoApiPlugin, discordInviteUrl } from './authInfo.js'

describe('GET /api/auth-info', () => {
  const get = async (opts: {
    mail: boolean
    verification: boolean
    contactEmail: string | null
    feedback: boolean
    discord: boolean
    discordInviteUrl?: string | null
  }) => {
    const app = createFastify()
    await app.register(authInfoApiPlugin, { discordInviteUrl: null, ...opts })
    const res = await app.inject({ method: 'GET', url: '/api/auth-info' })
    return { status: res.statusCode, body: res.json() }
  }

  it('answers mail off, verification off when the deployment sends no mail', async () => {
    expect(await get({ mail: false, verification: false, contactEmail: null, feedback: false, discord: false })).toEqual({
      status: 200,
      body: { mail: false, verification: false, contactEmail: null, feedback: false, discord: false, discordInviteUrl: null },
    })
  })

  it('answers mail on, verification required and Discord on when the deployment has them', async () => {
    expect(await get({ mail: true, verification: true, contactEmail: 'hi@x.org', feedback: true, discord: true })).toEqual({
      status: 200,
      body: { mail: true, verification: true, contactEmail: 'hi@x.org', feedback: true, discord: true, discordInviteUrl: null },
    })
  })

  it('answers the Discord invite when the deployment has one', async () => {
    const res = await get({
      mail: false,
      verification: false,
      contactEmail: null,
      feedback: false,
      discord: false,
      discordInviteUrl: 'https://discord.gg/x',
    })
    expect(res.body.discordInviteUrl).toBe('https://discord.gg/x')
  })
})

describe('discordInviteUrl', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['   ', null],
    ['http://discord.gg/x', null],
    ['javascript:alert(1)', null],
    ['discord.gg/x', null],
    ['https://discord.gg/x', 'https://discord.gg/x'],
    ['  https://discord.gg/x ', 'https://discord.gg/x'],
  ])('%j gives %j', (raw, want) => {
    expect(discordInviteUrl({ DISCORD_INVITE_URL: raw })).toBe(want)
  })

  it('ignores the Discord sign-in variables', () => {
    expect(discordInviteUrl({ DISCORD_CLIENT_ID: 'https://x.y', DISCORD_CLIENT_SECRET: 'https://x.y' })).toBeNull()
  })
})
