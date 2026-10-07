import { describe, it, expect } from 'vitest'
import { botAvatarColor } from '../botAvatarColor.js'

describe('botAvatarColor', () => {
  it('is a Tailwind background class for every level 1-10, each level a different colour', () => {
    const colors = new Set<string>()
    for (let level = 1; level <= 10; level++) {
      const c = botAvatarColor(level)
      expect(c).toMatch(/^bg-\[#[0-9a-f]{6}\]$/)
      colors.add(c)
    }
    expect(colors.size).toBe(10)
  })

  it('is stable for the same level', () => {
    expect(botAvatarColor(7)).toBe(botAvatarColor(7))
  })

  it('clamps out-of-range levels to the nearest end of the ramp', () => {
    expect(botAvatarColor(0)).toBe(botAvatarColor(1))
    expect(botAvatarColor(11)).toBe(botAvatarColor(10))
  })
})
