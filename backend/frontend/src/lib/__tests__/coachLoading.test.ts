import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

// See routeLoading.test.ts: a passthrough Layout keeps the nav (and the router) out
vi.mock('$lib/components/Layout.svelte', () => import('./fixtures/PassthroughLayout.svelte'))

const { default: CoachLoading } = await import('../../routes/CoachLoading.svelte')
const { default: CountCards } = await import('../components/coach/CountCards.svelte')
const { default: LiveCoachSkeleton } = await import('../components/coach/LiveCoachSkeleton.svelte')

describe('coach loading states', () => {
  it("shows the Coach list's skeleton, not the match details' loading line, while its chunk loads", () => {
    const out = render(CoachLoading, { props: { params: { page: 'list' } } }).body
    expect(out).not.toContain('Loading the game')
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain('Loading your coach reviews…')
    expect(out).toContain('Missed doubles') // the count cards, with placeholders for the numbers
  })

  it("shows the leg review's skeleton under the breadcrumb back to the list", () => {
    const out = render(CoachLoading, { props: { params: { page: 'leg' } } }).body
    expect(out).toContain("Loading the leg's review…")
    expect(out).toContain('href="#/coach"')
  })

  it('keeps the count cards while their numbers load', () => {
    const loading = render(CountCards, { props: { counts: null } }).body
    expect(loading).toContain('Clean legs')
    expect(loading).toContain('animate-pulse')
    const loaded = render(CountCards, { props: { counts: { legs: 3, lowVisits: 1, badSetups: 0, missedDoubles: 2, cleanLegs: 1 } } }).body
    expect(loaded).not.toContain('animate-pulse')
  })

  it("holds the live coach's place on the match screen while it loads", () => {
    expect(render(LiveCoachSkeleton).body).toContain('w-[340px]')
    expect(render(LiveCoachSkeleton, { props: { compact: true } }).body).toContain('loading…')
  })
})
