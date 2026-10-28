import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import StatusCard from '../components/friends/StatusCard.svelte'
import InvisibleBanner from '../components/friends/InvisibleBanner.svelte'

describe('status controls', () => {
  it('the Friends card explains the choice', () => {
    const out = render(StatusCard, { props: { invisible: true, onchange: () => null } }).body
    expect(out).toContain('Your status')
    expect(out).toContain('Friends see you as offline. People in your lobby still see you, and you can still play and get invites.')
  })
  it('the banner offers to go online', () => {
    const out = render(InvisibleBanner, { props: { ongoonline: () => {} } }).body
    expect(out).toContain("You're invisible.")
    expect(out).toContain('Friends see you as offline.')
    expect(out).toContain('>Go online<')
  })
})
