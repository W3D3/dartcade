import { describe, it, expect, vi } from 'vitest'
import type confetti from 'canvas-confetti'
import { CELEBRATIONS, celebrate } from '../celebrations.js'
import { cardColors } from '../progress/look.js'
import { PERKS } from '$shared/progression.js'

const fake = () => {
  const fire = vi.fn((_o: confetti.Options) => Promise.resolve())
  const colorsOf = () => fire.mock.calls.map(([o]) => o.colors)
  return { fire: Object.assign(fire, { reset: vi.fn() }) as unknown as confetti.CreateTypes, calls: fire, colorsOf }
}

describe('celebrations', () => {
  it('has a recipe for every celebration but the standard one', () => {
    const ids = PERKS.filter(p => p.kind === 'celebration' && p.id !== 'celebration.standard').map(p => p.id)
    expect(Object.keys(CELEBRATIONS).sort()).toEqual(ids.sort())
  })

  it("throws confetti in the winner's card colours, and nothing for the standard win screen", () => {
    const f = fake()
    celebrate(f.fire, 'celebration.confetti', cardColors('colors.ice'))
    expect(f.colorsOf().length).toBeGreaterThan(0)
    for (const c of f.colorsOf()) expect(c).toContain('#bfeaf5')
    const none = fake()
    celebrate(none.fire, 'celebration.standard', cardColors('colors.ice'))
    expect(none.calls).not.toHaveBeenCalled()
  })

  it('keeps the fireworks going a few seconds, and stops them when asked', () => {
    vi.useFakeTimers()
    const f = fake()
    const stop = celebrate(f.fire, 'celebration.legend', cardColors('colors.ice'))
    for (const c of f.colorsOf()) expect(c).toContain('#f2c14e')
    const first = f.calls.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(f.calls.mock.calls.length).toBeGreaterThan(first)
    stop()
    const stopped = f.calls.mock.calls.length
    vi.advanceTimersByTime(5000)
    expect(f.calls.mock.calls.length).toBe(stopped)
    vi.useRealTimers()
  })
})
