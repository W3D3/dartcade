import { describe, it, expect } from 'vitest'
import { ADMIN_TOOLS, toolsFor } from './tools'

describe('toolsFor', () => {
  it('shows an admin every tool', () => {
    expect(toolsFor({ isAdmin: true })).toEqual(ADMIN_TOOLS)
  })

  it('shows a moderator only the game tools', () => {
    expect(toolsFor({ isAdmin: false }).map(t => t.href)).toEqual(['/admin/games'])
  })

  it('shows nobody nothing', () => {
    expect(toolsFor(null)).toEqual([])
  })
})
