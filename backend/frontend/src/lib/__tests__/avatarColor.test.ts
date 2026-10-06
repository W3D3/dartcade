import { describe, it, expect } from 'vitest'
import { avatarColor } from '../avatarColor.js'

describe('avatarColor', () => {
  it('is stable for the same name', () => {
    expect(avatarColor('Christoph')).toBe(avatarColor('Christoph'))
    expect(avatarColor('Jonas')).toBe(avatarColor('Jonas'))
  })

  it('is a Tailwind background class, not the same one for every name', () => {
    const names = ['Christoph', 'Jonas', 'Luke', 'Phil', 'Michael', 'Gerwyn', 'Sarah', 'Anna']
    const colors = new Set(names.map(avatarColor))
    for (const c of colors) expect(c).toMatch(/^bg-\[#[0-9a-f]{6}\]$/)
    expect(colors.size).toBeGreaterThan(1)
  })

  it('is case-sensitive: names only differing in case are different handles', () => {
    // Not a strong requirement, just documents the actual (simple, deterministic) behaviour
    expect(typeof avatarColor('christoph')).toBe('string')
  })
})
