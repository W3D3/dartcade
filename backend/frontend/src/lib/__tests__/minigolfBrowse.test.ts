import { describe, it, expect } from 'vitest'
import { courseMeta, type BrowseCourse } from '$lib/minigolf/browse'
import { courseStatus, type CourseRow } from '$lib/minigolf/editor/course'

const browse = (extra: Partial<BrowseCourse> = {}): BrowseCourse => ({
  id: 'c',
  name: 'Links',
  description: '',
  difficulty: 1,
  authorName: 'Olive',
  holeCount: 9,
  plays: 1,
  thumbnail: null,
  ...extra,
})

describe('courseMeta', () => {
  it('says author, holes and plays, with the singular where it is one', () => {
    expect(courseMeta(browse())).toBe('by Olive · 9 holes · 1 play')
    expect(courseMeta(browse({ authorName: null, holeCount: 1, plays: 0 }))).toBe('by a player · 1 hole · 0 plays')
  })
})

describe('courseStatus', () => {
  it('shows a course a moderator took down as such, whatever else it has', () => {
    const row = { published: null, hasChanges: true, moderation: { reason: 'Rude', at: '2026-01-01T00:00:00.000Z' } } as CourseRow
    expect(courseStatus(row)).toBe('Taken down')
  })
})
