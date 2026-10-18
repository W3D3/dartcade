import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import DeleteAccount from '../components/settings/DeleteAccount.svelte'
import { canConfirm } from '../deleteAccount.js'

describe('DeleteAccount', () => {
  it('shows the danger-zone copy and trigger, closed', () => {
    const out = render(DeleteAccount).body
    expect(out).toContain('Danger zone')
    expect(out).toContain('Deletes your profile, boards, friends and history. Your name stays in match history other players keep.')
    expect(out).toContain('Delete account')
    // The modal isn't mounted until the trigger is clicked
    expect(out).not.toContain('This removes your profile, boards, friends, lobbies and game history.')
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
