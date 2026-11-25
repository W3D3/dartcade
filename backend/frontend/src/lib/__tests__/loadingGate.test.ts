import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'svelte/server'
import { createGate, type Gate } from '../loadingGate'
import ProfileCardSkeleton from '../components/progress/ProfileCardSkeleton.svelte'

function gate(loading: boolean) {
  let g: Gate = { holding: false, revealed: false, waited: false }
  const c = createGate(next => (g = next), loading)
  return { c, get: () => g }
}

describe('loading gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds the place at once but paints the skeleton only after the delay', () => {
    const { get } = gate(true)
    expect(get()).toMatchObject({ holding: true, revealed: false })
    vi.advanceTimersByTime(149)
    expect(get().revealed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(get().revealed).toBe(true)
  })

  it('never paints the skeleton for a fast load, and still fades the content in', () => {
    const { c, get } = gate(true)
    vi.advanceTimersByTime(100)
    c.set(false)
    expect(get()).toEqual({ holding: false, revealed: false, waited: true })
    vi.advanceTimersByTime(1000)
    expect(get().revealed).toBe(false)
  })

  it('keeps a painted skeleton for at least 300 ms', () => {
    const { c, get } = gate(true)
    vi.advanceTimersByTime(200)
    c.set(false)
    expect(get().holding).toBe(true)
    vi.advanceTimersByTime(249)
    expect(get().holding).toBe(true)
    vi.advanceTimersByTime(1)
    expect(get().holding).toBe(false)
  })

  it('does nothing when the content is there from the start', () => {
    expect(gate(false).get()).toEqual({ holding: false, revealed: false, waited: false })
  })
})

describe('profile card skeleton', () => {
  const html = (props: object) => render(ProfileCardSkeleton, { props }).body

  it("has the real card's size tokens in each variant", () => {
    const card = html({})
    for (const t of ['w-[320px]', 'h-[88px]', 'mt-[-34px]', 'size-[68px]', 'px-[22px]', 'grid-cols-3', 'rounded-popover'])
      expect(card).toContain(t)
    const hero = html({ variant: 'hero' })
    for (const t of ['h-[110px]', 'md:h-[200px]', 'md:size-[136px]', 'md:mt-[-68px]', 'rounded-popover']) expect(hero).toContain(t)
  })

  it('reserves the space unpainted until revealed, and stops pulsing for reduced motion', () => {
    expect(html({ revealed: false })).toContain('opacity-0')
    expect(html({ revealed: true })).toContain('opacity-100')
    const out = html({})
    expect(out).toContain('animate-skeleton')
    expect(out).toContain('motion-reduce:animate-skeleton-soft')
    expect(out).not.toContain('animate-none')
  })

  it("shows the hero's buttons only on your own profile", () => {
    expect(html({ variant: 'hero', actions: true })).toContain('w-[154px]')
    expect(html({ variant: 'hero' })).not.toContain('w-[154px]')
  })
})
