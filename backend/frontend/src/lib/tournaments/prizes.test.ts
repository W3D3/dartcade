import { describe, expect, it } from 'vitest'
import { heroOf, placeLabel, titleName, xpLabel } from './prizes'

describe('prizes', () => {
  it('labels places the way the design does', () => {
    expect(['1st', '2nd', '3rd', '11th', '21st'].map(l => l)).toEqual([1, 2, 3, 11, 21].map(n => placeLabel({ from: n, to: n })))
    expect(placeLabel({ from: 3, to: 4 })).toBe('3–4')
  })

  it('groups XP in thousands and names the title perk', () => {
    expect(xpLabel(2000)).toBe('2,000 XP')
    expect(xpLabel(500)).toBe('500 XP')
    expect(titleName({ title: 'title.weekly-champion' })).toBe('Weekly Champion')
    expect(titleName({ title: null })).toBeNull()
  })

  it('features the first official tournament still taking registrations', () => {
    const list = [
      { id: 'a', kind: 'community', status: 'open' },
      { id: 'b', kind: 'official', status: 'running' },
      { id: 'c', kind: 'official', status: 'open' },
      { id: 'd', kind: 'official', status: 'check_in' },
    ] as const
    expect(heroOf(list)?.id).toBe('c')
    expect(heroOf(list.slice(0, 2))).toBeUndefined()
  })
})
