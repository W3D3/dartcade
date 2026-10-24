import { describe, it, expect } from 'vitest'
import { flagsTrail, gamesTrail, minigolfCoursesTrail, minigolfHoleTrail, minigolfBenchTrail, systemTrail, usersTrail } from './breadcrumbs'

describe('usersTrail / systemTrail / minigolfBenchTrail', () => {
  it('is Admin, then the page, with no link on the current page', () => {
    expect(usersTrail()).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Users' }])
    expect(systemTrail()).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'System' }])
    expect(minigolfBenchTrail()).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Minigolf bench' }])
  })
})

describe('flagsTrail', () => {
  it('ends at Feature flags, unlinked, with no flag open', () => {
    const trail = flagsTrail(null)
    expect(trail).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Feature flags' }])
  })

  it('links Feature flags back to the list once a flag is open, and ends on the flag key', () => {
    const trail = flagsTrail('gamemode.minigolf.enabled')
    expect(trail).toEqual([
      { label: 'Admin', href: '#/admin' },
      { label: 'Feature flags', href: '#/admin/flags' },
      { label: 'gamemode.minigolf.enabled' },
    ])
  })
})

describe('gamesTrail', () => {
  it('ends at Games, unlinked, on the list', () => {
    expect(gamesTrail()).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Games' }])
  })

  it('links Games back to the list once a game is open, and ends on the game', () => {
    expect(gamesTrail('X01')).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Games', href: '#/admin/games' }, { label: 'X01' }])
  })
})

describe('minigolfCoursesTrail', () => {
  it('ends at Minigolf courses, unlinked, with no course picked', () => {
    expect(minigolfCoursesTrail(null)).toEqual([{ label: 'Admin', href: '#/admin' }, { label: 'Minigolf courses' }])
  })

  it('links Minigolf courses back to the list once a course is picked, and ends on its name', () => {
    expect(minigolfCoursesTrail('The Volcano')).toEqual([
      { label: 'Admin', href: '#/admin' },
      { label: 'Minigolf courses', href: '#/admin/minigolf/courses' },
      { label: 'The Volcano' },
    ])
  })
})

describe('minigolfHoleTrail', () => {
  it('chains Admin, the courses list, the course, then the hole', () => {
    expect(minigolfHoleTrail('The Volcano', '#/admin/minigolf/courses/c1', 'Hole 3')).toEqual([
      { label: 'Admin', href: '#/admin' },
      { label: 'Minigolf courses', href: '#/admin/minigolf/courses' },
      { label: 'The Volcano', href: '#/admin/minigolf/courses/c1' },
      { label: 'Hole 3' },
    ])
  })

  it('falls back to "Courses" when the course name is not loaded yet', () => {
    const trail = minigolfHoleTrail(null, '#/admin/minigolf/courses', 'Hole 3')
    expect(trail[2]).toEqual({ label: 'Courses', href: '#/admin/minigolf/courses' })
  })
})
