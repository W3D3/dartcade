import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import { writable } from 'svelte/store'
import {
  courseStatus,
  courseTotals,
  newHole,
  problemLines,
  provenance,
  publishOutcome,
  type CourseRow,
  type HoleRow,
} from '$lib/minigolf/editor/course'
import { holeChecks } from '$shared/minigolf/checks'
import { toHole, type DraftStatus } from '$lib/minigolf/editor/store.svelte'

// PopoverMenu pulls in bits-ui's barrel, which this toolchain's SSR can't compile (see lobbyAccessPanel.test.ts)
vi.mock('bits-ui', () => ({
  Popover: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
}))
const user = writable<{ isAdmin: boolean } | null>(null)
vi.mock('$lib/auth', () => ({ currentUser: user }))
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))
vi.mock('svelte-spa-router', () => ({ push: vi.fn(), location: writable('/'), querystring: writable('') }))

const { default: CourseHoles } = await import('../components/minigolf/editor/CourseHoles.svelte')
const { default: CourseHeader } = await import('../components/minigolf/editor/CourseHeader.svelte')
const { default: MinigolfCourses } = await import('../../routes/MinigolfCourses.svelte')

const row = (id: string, name: string, par: number, extra: Partial<HoleRow> = {}): HoleRow => ({
  id,
  ownerUserId: null,
  published: { ...newHole(), id, name, par },
  draft: null,
  version: 1,
  updatedAt: '2026-10-14T10:00:00Z',
  publishedAt: '2026-10-14T10:00:00Z',
  ...extra,
})

describe('course editor helpers', () => {
  it('adds up holes, par and about 2 minutes a hole', () => {
    expect(courseTotals([{ par: 2 }, { par: 3 }, { par: 4 }])).toEqual({ holes: 3, par: 9, minutes: 6 })
  })
  it('lists a refused publish by hole number in playing order, errors only', () => {
    const lines = problemLines(
      [
        { holeId: 'c', checks: [{ level: 'error', message: 'Cup is outside the outline' }] },
        {
          holeId: 'b',
          checks: [
            { level: 'error', message: 'Outline crosses itself' },
            { level: 'warning', message: 'Cup is close to the rail' },
          ],
        },
      ],
      ['a', 'b', 'c'],
    )
    expect(lines).toEqual(['Hole 2 · Outline crosses itself', 'Hole 3 · Cup is outside the outline'])
  })
  it("lists a problem with the course itself (holeId '') first, without a hole number", () => {
    const problems = [{ holeId: '', checks: [{ level: 'error' as const, message: 'Add at least one hole' }] }]
    expect(problemLines(problems, [])).toEqual(['Add at least one hole'])
  })
  it('says where a hole comes from and how many courses use it', () => {
    expect(provenance(row('a', 'A', 2, { usedBy: 2 }))).toBe('Official · in 2 courses')
    expect(provenance(row('a', 'A', 2, { usedBy: 0 }))).toBe('Official · not used yet')
  })
  it("chips a course by whether it has unpublished changes, its own or its holes'", () => {
    const c = {
      published: { name: 'X', description: '', difficulty: 1, holeIds: [] },
      draft: null,
      hasChanges: false,
    } as unknown as CourseRow
    expect(courseStatus(c)).toBe('Published')
    expect(courseStatus({ ...c, draft: c.published, hasChanges: true })).toBe('Draft changes')
    // Only a hole of it was edited: the course has no draft of its own
    expect(courseStatus({ ...c, hasChanges: true })).toBe('Draft changes')
    expect(courseStatus({ ...c, published: null })).toBe('Not published')
  })
  it('words a publish that failed by why it failed', () => {
    expect(publishOutcome('threw', ['a'])).toEqual({ problems: [], error: "Couldn't publish. Try again." })
    expect(publishOutcome({ notSaved: 'error' }, ['a'])).toEqual({ problems: [], error: "Couldn't publish: the draft isn't saved yet." })
    // The header already says to reload
    expect(publishOutcome({ notSaved: 'conflict' }, ['a'])).toEqual({ problems: [], error: null })
    expect(publishOutcome(null, ['a'])).toEqual({ problems: [], error: null })
    const refused = publishOutcome([{ holeId: 'a', checks: [{ level: 'error', message: 'No cup' }] }] as never, ['a'])
    expect(refused).toEqual({ problems: ['Hole 1 · No cup'], error: null })
  })
  it('starts a new hole that passes the checks', () => {
    expect(holeChecks(toHole(newHole())).filter(c => c.level === 'error')).toEqual([])
  })
})

describe('CourseHoles', () => {
  it('shows each hole with its number, name and par, and the total par', () => {
    const holes = [row('a', 'Harbour', 2), row('b', 'Lighthouse', 3)]
    const out = render(CourseHoles, {
      props: {
        items: holes.map(h => ({ id: h.id, name: h.published?.name ?? '', row: h })),
        courseId: 'c1',
        onduplicate: () => {},
        onremove: () => {},
        onnew: () => {},
      },
    }).body
    const text = out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toMatch(/ 1 Harbour .*Par 2 /)
    expect(text).toMatch(/ 2 Lighthouse .*Par 3 /)
    expect(out).toContain('2 holes · par 5 · ≈ 4 min')
    expect(out).toContain('#/admin/minigolf/holes/b?course=c1')
  })
})

describe('CourseHeader', () => {
  const header = (props: {
    status: DraftStatus
    loaded?: boolean
    published?: boolean
    builtIn?: boolean
    problems?: string[]
    error?: string | null
  }) =>
    render(CourseHeader, {
      props: {
        courseId: 'c1',
        savedAt: null,
        hasDraft: true,
        published: true,
        loaded: true,
        problems: [],
        onpublish: () => {},
        ondiscard: () => {},
        onunpublish: () => {},
        ondelete: () => {},
        onreload: () => {},
        ...props,
      },
    }).body
  const disabled = (out: string, label: string) =>
    new RegExp(`<button[^>]*\\sdisabled(?=[\\s>=])[^>]*>(?:(?!</button>).)*${label}`, 's').test(out)

  it('lists the checks that refused a publish', () => {
    const out = header({ status: 'saved', problems: ['Hole 2 · Outline crosses itself'] })
    expect(out).toContain('Hole 2 · Outline crosses itself')
    expect(out).toContain('#/admin/minigolf?course=c1&amp;draft=1')
    expect(disabled(out, 'Publish changes')).toBe(false)
  })
  it('shows a failed publish as just its error, without the checks heading', () => {
    const out = header({ status: 'saved', error: "Couldn't publish. Try again." })
    expect(out).toContain("Couldn't publish. Try again.")
    expect(out).not.toContain('Fix these first')
    expect(header({ status: 'saved', problems: ['Hole 1 · No cup'] })).toContain('Not published. Fix these first:')
  })
  it('says a save is being retried', () => {
    expect(header({ status: 'error' })).toContain('Not saved – retrying')
  })
  it('says a save the server refused is not being retried', () => {
    const out = header({ status: 'rejected' })
    expect(out).toContain('Not saved – the server refused this change')
    expect(out).not.toContain('retrying')
  })
  it('offers no Discard for a course that was never published', () => {
    const out = header({ status: 'saved', published: false })
    expect(disabled(out, 'Discard draft')).toBe(true)
    expect(disabled(out, 'Publish changes')).toBe(false)
  })
  it('offers Unpublish only for a published course, and Delete only for one not built in', () => {
    const out = header({ status: 'saved' })
    expect(disabled(out, 'Unpublish')).toBe(false)
    expect(disabled(out, 'Delete')).toBe(false)
    expect(header({ status: 'saved', published: false })).not.toContain('Unpublish')
    expect(header({ status: 'saved', builtIn: true })).not.toMatch(/>\s*Delete\s*</)
  })
  it("offers nothing to publish or discard when the course couldn't be loaded", () => {
    const out = header({ status: 'error', loaded: false })
    expect(out).toContain("Couldn't load this course")
    expect(out).not.toContain('retrying')
    expect(disabled(out, 'Publish changes')).toBe(true)
    expect(disabled(out, 'Discard draft')).toBe(true)
  })
})

describe('MinigolfCourses', () => {
  it('shows nothing to someone who is not an admin', () => {
    user.set({ isAdmin: false })
    expect(render(MinigolfCourses, { props: { params: null } }).body).not.toContain('New course')
    user.set({ isAdmin: true })
    expect(render(MinigolfCourses, { props: { params: null } }).body).toContain('New course')
  })
})
