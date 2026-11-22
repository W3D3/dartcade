import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from 'svelte/server'

vi.mock('svelte-spa-router', async () => {
  const { writable } = await import('svelte/store')
  return { push: vi.fn(), querystring: writable('') }
})

const { default: AccountCard } = await import('../components/settings/AccountCard.svelte')
const { currentUser } = await import('../auth.js')

const me = (email: string | null) =>
  ({ id: 'u1', name: 'Lena', email, signInMethods: ['discord'], createdAt: '2026-08-01T10:00:00.000Z' }) as unknown as Parameters<
    typeof currentUser.set
  >[0]

describe('AccountCard', () => {
  afterEach(() => currentUser.set(null))

  it('shows the email', () => {
    currentUser.set(me('lena@example.org'))
    expect(render(AccountCard).body).toContain('lena@example.org')
  })

  it('says Discord shared none when the account has no email', () => {
    currentUser.set(me(null))
    expect(render(AccountCard).body).toContain('Not shared by Discord')
  })
})
