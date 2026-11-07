import { describe, it, expect } from 'vitest'
import { ADMIN_CATEGORIES, ADMIN_TOOLS, toolGroupsFor, toolsFor } from './tools'

describe('toolsFor', () => {
  it('shows an admin every tool', () => {
    expect(toolsFor({ isAdmin: true })).toEqual(ADMIN_TOOLS)
  })

  it('shows a moderator only the game and queue tools', () => {
    expect(toolsFor({ isAdmin: false }).map(t => t.href)).toEqual(['/admin/games', '/admin/ranked'])
  })

  it('shows nobody nothing', () => {
    expect(toolsFor(null)).toEqual([])
  })
})

describe('toolGroupsFor', () => {
  it("groups an admin's tools in category order, every tool once", () => {
    const groups = toolGroupsFor({ isAdmin: true })
    expect(groups.map(g => g.category)).toEqual([...ADMIN_CATEGORIES])
    expect(groups.flatMap(g => g.tools).toSorted((a, b) => a.href.localeCompare(b.href))).toEqual(
      ADMIN_TOOLS.toSorted((a, b) => a.href.localeCompare(b.href)),
    )
  })

  it('shows a moderator only their tools and hides the empty categories', () => {
    const groups = toolGroupsFor({ isAdmin: false })
    expect(groups.map(g => g.category)).toEqual(['People & moderation'])
    expect(groups[0].tools.map(t => t.href)).toEqual(['/admin/games', '/admin/ranked'])
  })

  it('shows nobody nothing', () => {
    expect(toolGroupsFor(null)).toEqual([])
  })
})
