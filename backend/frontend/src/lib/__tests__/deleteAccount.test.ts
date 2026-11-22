import { describe, it, expect, vi, afterEach } from 'vitest'
import { writable } from 'svelte/store'
import { render } from 'svelte/server'

const route = vi.hoisted(() => ({ querystring: null as unknown as ReturnType<typeof writable<string>> }))
vi.mock('svelte-spa-router', async () => {
  const { writable } = await import('svelte/store')
  route.querystring = writable('')
  return { push: vi.fn(), querystring: route.querystring }
})

const { default: DeleteAccount } = await import('../components/settings/DeleteAccount.svelte')
const { canConfirm } = await import('../deleteAccount.js')
const { currentUser } = await import('../auth.js')
const { discordReauth } = await import('../discord.js')

const me = (signInMethods: ('password' | 'discord')[]) =>
  ({ id: 'u1', name: 'Lena', email: 'lena@example.org', signInMethods }) as unknown as Parameters<typeof currentUser.set>[0]

describe('DeleteAccount', () => {
  afterEach(() => {
    route.querystring.set('')
    currentUser.set(null)
  })

  it('shows the danger-zone copy and trigger, closed', () => {
    const out = render(DeleteAccount).body
    expect(out).toContain('Danger zone')
    expect(out).toContain('Deletes your profile, boards, friends and history. Your name stays in match history other players keep.')
    expect(out).toContain('Delete account')
    // The modal isn't mounted until the trigger is clicked
    expect(out).not.toContain('This removes your profile, boards, friends, lobbies and game history.')
  })

  it('opens ready to delete when an account without a password comes back from signing in with Discord again', () => {
    currentUser.set(me(['discord']))
    route.querystring.set('confirmDelete=u1')
    const out = render(DeleteAccount).body
    expect(out).toContain('You signed in with Discord again as')
    expect(out).toContain('@Lena')
    expect(out).not.toContain('delete-account-password')
  })

  it('never offers to delete an account that came back from Discord in place of the one that asked', () => {
    currentUser.set(me(['discord']))
    route.querystring.set('confirmDelete=someone-else')
    const out = render(DeleteAccount).body
    expect(out).not.toContain('You signed in with Discord again')
    expect(out).toContain('You signed in to Discord as another account (@Lena). Nothing was deleted.')
    // Back at step one: type the name, then Discord again
    expect(out).toContain('delete-account-confirm')
  })

  it('stays closed for an account without a password that has not just signed in again', () => {
    currentUser.set(me(['discord']))
    const out = render(DeleteAccount).body
    expect(out).toContain('Danger zone')
    expect(out).not.toContain('This removes your profile')
  })

  it("doesn't skip the password for an account that has one, whatever the address says", () => {
    currentUser.set(me(['password', 'discord']))
    route.querystring.set('confirmDelete=u1')
    expect(render(DeleteAccount).body).not.toContain('You signed in with Discord again')
  })

  it('signs in with Discord again and comes back to Settings to confirm, naming the account that asked', () => {
    expect(discordReauth('u1', 'https://play.example.org')).toEqual({
      provider: 'discord',
      callbackURL: 'https://play.example.org/#/settings/profile?confirmDelete=u1',
      errorCallbackURL: 'https://play.example.org/#/settings/profile',
    })
  })
})

describe('canConfirm', () => {
  it('holds only for an exact name and a non-empty password', () => {
    expect(canConfirm('Lena', 'Lena', 'pw')).toBe(true)
    expect(canConfirm(' Lena ', 'Lena', 'pw')).toBe(true)
    expect(canConfirm('lena', 'Lena', 'pw')).toBe(false)
    expect(canConfirm('Lena', 'Lena', '')).toBe(false)
    expect(canConfirm('', 'Lena', 'pw')).toBe(false)
  })
})
