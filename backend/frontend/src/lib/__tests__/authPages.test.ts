import { describe, it, expect, afterEach } from 'vitest'
import { render } from 'svelte/server'
import AuthPanel from '../components/AuthPanel.svelte'
import DiscordSignIn from '../components/DiscordSignIn.svelte'
import { authInfo } from '../authInfo.js'
import { discordSignIn } from '../discord.js'

describe('Continue with Discord', () => {
  const info = { mail: true, verification: true, contactEmail: null, feedback: false }
  afterEach(() => authInfo.set({ ...info, discord: false }))

  it('shows nothing when the deployment has no Discord sign-in', () => {
    authInfo.set({ ...info, discord: false })
    expect(render(DiscordSignIn).body).not.toContain('Discord')
  })

  it('shows the button and the terms line, with no checkbox, when it has', () => {
    authInfo.set({ ...info, discord: true })
    const out = render(DiscordSignIn).body
    expect(out).toContain('Continue with Discord')
    expect(out).toMatch(/By continuing you agree to the <a href="#\/terms">Terms<\/a> and <a href="#\/privacy">Privacy Policy<\/a>/)
    expect(out).not.toContain('type="checkbox"')
  })

  it('comes back to the page it came from, a new account to step 2, and a failure to #/login', () => {
    expect(discordSignIn('/', 'https://play.example.org')).toEqual({
      provider: 'discord',
      callbackURL: 'https://play.example.org/#/',
      newUserCallbackURL: 'https://play.example.org/#/settings/boards',
      errorCallbackURL: 'https://play.example.org/#/login',
    })
    expect(discordSignIn('/join/K7Q4MD', 'https://play.example.org').newUserCallbackURL).toBe('https://play.example.org/#/join/K7Q4MD')
  })
})

describe('AuthPanel', () => {
  it('shows the board and headline when signing in', () => {
    const out = render(AuthPanel, { props: { variant: 'signin' } }).body
    expect(out).toContain('Step up to the oche.')
  })
  it('shows the 180 and the three steps when registering', () => {
    const out = render(AuthPanel, { props: { variant: 'register' } }).body
    expect(out).toContain('Three darts.')
    for (const s of ['Create your account', 'Connect your board', 'Pick a game and throw']) expect(out).toContain(s)
  })
})
