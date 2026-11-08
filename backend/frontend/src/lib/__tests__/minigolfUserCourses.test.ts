import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { writable } from 'svelte/store'
import { ADMIN_AREA, PLAYER_AREA, limitMessage, listedCourses, mayEdit } from '$lib/minigolf/editor/area'
import { userCourseCards, type CourseRow } from '$lib/minigolf/editor/course'
import { minigolfCoursesTrail } from '$lib/admin/breadcrumbs'

const user = writable<{ id: string; isAdmin: boolean } | null>(null)
const userCoursesFlag = writable(false)
vi.mock('$lib/auth', () => ({ currentUser: user }))
vi.mock('$lib/flags', () => ({ flag: () => userCoursesFlag, flagsLoaded: writable(true) }))
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))
vi.mock('svelte-spa-router', () => ({ push: vi.fn(), location: writable('/'), querystring: writable('') }))

const { default: MinigolfCourses } = await import('../../routes/MinigolfCourses.svelte')
const { default: PhoneBanner } = await import('../components/minigolf/editor/PhoneBanner.svelte')

const content = (name: string) => ({ name, description: '', difficulty: 1 as const, holeIds: ['a', 'b'] })
const course = (id: string, extra: Partial<CourseRow> = {}): CourseRow => ({
  id,
  ownerUserId: null,
  visibility: 'official',
  authorName: null,
  published: content(id),
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: null,
  ...extra,
})

describe('who may edit', () => {
  it('lets a player in only with the flag, and only in the player area', () => {
    const player = { isAdmin: false }
    expect(mayEdit(PLAYER_AREA, player, false)).toBe(false)
    expect(mayEdit(PLAYER_AREA, player, true)).toBe(true)
    expect(mayEdit(ADMIN_AREA, player, true)).toBe(false)
    expect(mayEdit(ADMIN_AREA, { isAdmin: true }, false)).toBe(true)
  })
  it("lists only the player's own courses in the player area", () => {
    const all = [course('official'), course('mine', { ownerUserId: 'p' }), course('theirs', { ownerUserId: 'q', visibility: 'public' })]
    expect(listedCourses(PLAYER_AREA, all, 'p').map(c => c.id)).toEqual(['mine'])
    expect(listedCourses(ADMIN_AREA, all, 'a')).toHaveLength(3)
  })
})

describe('user course picker group', () => {
  it('keeps the published courses players made, with author and size', () => {
    const cards = userCourseCards([
      course('official'),
      course('draft', { ownerUserId: 'p', visibility: 'private', published: null }),
      course('user', { ownerUserId: 'p', visibility: 'public', authorName: 'Pat' }),
    ])
    expect(cards).toEqual([{ id: 'user', name: 'user', sub: 'by Pat · 2 holes' }])
  })
})

describe('limits and breadcrumbs', () => {
  it('says what to do about each limit', () => {
    expect(limitMessage('published', 5)).toBe('You can have 5 published courses. Unpublish one first.')
    expect(limitMessage('courseHoles', 18)).toBe('A course can have 18 holes at most.')
  })
  it('starts the player trail at Play and the admin trail at Admin', () => {
    expect(minigolfCoursesTrail('X', PLAYER_AREA).map(i => i.label)).toEqual(['Play', 'My courses', 'X'])
    expect(minigolfCoursesTrail(null, ADMIN_AREA).map(i => i.label)).toEqual(['Admin', 'Minigolf courses'])
  })
})

describe('the player course list', () => {
  it('is empty-stated and writable for a player with the flag, and blank without it', () => {
    user.set({ id: 'p', isAdmin: false })
    userCoursesFlag.set(false)
    expect(render(MinigolfCourses, { props: { params: null, area: PLAYER_AREA } }).body).not.toContain('New course')
    userCoursesFlag.set(true)
    const body = render(MinigolfCourses, { props: { params: null, area: PLAYER_AREA } }).body
    expect(body).toContain('New course')
    expect(body).toContain('My courses')
    expect(body).not.toContain('Admin')
  })
})

describe('PhoneBanner', () => {
  it('renders nothing off a phone', () => {
    expect(render(PhoneBanner).body).not.toContain("isn't made for phones")
  })
})
