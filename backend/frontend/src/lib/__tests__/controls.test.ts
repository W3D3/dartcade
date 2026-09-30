import { describe, it, expect } from 'vitest'
import { nextButton } from '../controls.js'

describe('nextButton', () => {
  const base = { manual: false, dartCount: 1, locked: false, active: true }
  it('board session mid-visit: quiet skip', () => expect(nextButton(base)).toEqual({ label: 'Skip to next', prominent: false, enabled: true }))
  it('board session with no darts: quiet skip (records three misses)', () => expect(nextButton({ ...base, dartCount: 0 }).label).toBe('Skip to next'))
  it('three darts in: next player', () => expect(nextButton({ ...base, dartCount: 3 })).toEqual({ label: 'Next player', prominent: true, enabled: true }))
  it('visit over (bust, checkout): next player', () => expect(nextButton({ ...base, locked: true }).label).toBe('Next player'))
  it('no board: always next player', () => expect(nextButton({ ...base, manual: true, dartCount: 0 }).label).toBe('Next player'))

  it('after a win with the winning visit still open: next player commits it', () => {
    expect(nextButton({ ...base, active: false, dartCount: 2, locked: true })).toEqual({ label: 'Next player', prominent: true, enabled: true })
  })
  it('after a win with nothing open: disabled', () => {
    expect(nextButton({ ...base, active: false, dartCount: 0, locked: true }).enabled).toBe(false)
  })
})
