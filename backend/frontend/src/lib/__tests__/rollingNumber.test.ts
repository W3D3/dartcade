import { describe, it, expect } from 'vitest'
import { parseRolling, planChange, planDrums } from '../rollingNumber.js'

describe('parseRolling', () => {
  it('splits a number into a static prefix and its digits', () => {
    expect(parseRolling('141')).toEqual({ prefix: '', digits: '141' })
    expect(parseRolling('+2')).toEqual({ prefix: '+', digits: '2' })
  })

  it('is null for text that is not a number', () => {
    expect(parseRolling('Bull')).toBeNull()
    expect(parseRolling('✓')).toBeNull()
    expect(parseRolling('')).toBeNull()
    expect(parseRolling('1a')).toBeNull()
  })
})

describe('planDrums', () => {
  it('rolls each drum down the short way, wrapping past 0 (141 → 81)', () => {
    expect(planDrums('141', '81', 'down')).toEqual([
      { place: 2, from: 1, to: 0, steps: -1, enter: false, leave: true },
      { place: 1, from: 4, to: 8, steps: -6, enter: false, leave: false },
      // The ones drum turns a full round even though its digit stays 1
      { place: 0, from: 1, to: 1, steps: -10, enter: false, leave: false },
    ])
  })

  it('leaves drums whose digit stays (other than the ones) standing', () => {
    expect(planDrums('81', '36', 'down').map(d => d.steps)).toEqual([-5, -5])
    expect(planDrums('501', '441', 'down').map(d => d.steps)).toEqual([-1, -6, -10])
    expect(planDrums('501', '461', 'down').map(d => d.steps)).toEqual([-1, -4, -10])
  })

  it('lets leading digits slide away when the number gets shorter (36 → 0)', () => {
    expect(planDrums('36', '0', 'down')).toEqual([
      { place: 1, from: 3, to: 0, steps: -3, enter: false, leave: true },
      { place: 0, from: 6, to: 0, steps: -6, enter: false, leave: false },
    ])
  })

  it('rolls upward on the way up, bringing in new leading digits (0 → 60 → 105)', () => {
    expect(planDrums('0', '60', 'up')).toEqual([
      { place: 1, from: 0, to: 6, steps: 6, enter: true, leave: false },
      { place: 0, from: 0, to: 0, steps: 10, enter: false, leave: false },
    ])
    expect(planDrums('60', '105', 'up')).toEqual([
      { place: 2, from: 0, to: 1, steps: 1, enter: true, leave: false },
      { place: 1, from: 6, to: 0, steps: 4, enter: false, leave: false },
      { place: 0, from: 0, to: 5, steps: 5, enter: false, leave: false },
    ])
  })

  it('crosses a digit count: 100 → 99 drops the hundreds, 9 → 10 brings in the tens', () => {
    expect(planDrums('100', '99', 'down')).toEqual([
      { place: 2, from: 1, to: 0, steps: -1, enter: false, leave: true },
      { place: 1, from: 0, to: 9, steps: -1, enter: false, leave: false },
      { place: 0, from: 0, to: 9, steps: -1, enter: false, leave: false },
    ])
    expect(planDrums('9', '10', 'up')).toEqual([
      { place: 1, from: 0, to: 1, steps: 1, enter: true, leave: false },
      { place: 0, from: 9, to: 0, steps: 1, enter: false, leave: false },
    ])
  })

  it('rolls a take-back upward (36 → 81, bust 12 → 32)', () => {
    expect(planDrums('36', '81', 'up').map(d => d.steps)).toEqual([5, 5])
    expect(planDrums('12', '32', 'up').map(d => d.steps)).toEqual([2, 10])
  })

  it('keeps every drum still when the number is the same', () => {
    expect(planDrums('32', '32', 'up').map(d => d.steps)).toEqual([0, 0])
  })
})

describe('planChange', () => {
  const base = { normal: 'down' as const }

  it('does nothing when the value stays', () => {
    expect(planChange({ ...base, from: '81', to: '81' }).kind).toBe('none')
  })

  it('jumps on the first value and after a reset (new leg, new visit)', () => {
    expect(planChange({ ...base, from: null, to: '501' }).kind).toBe('jump')
    expect(planChange({ ...base, from: '0', to: '501', reset: true }).kind).toBe('jump')
  })

  it('jumps when either side is not a number, or the prefix changes', () => {
    expect(planChange({ ...base, from: '20', to: 'Bull' }).kind).toBe('jump')
    expect(planChange({ ...base, from: 'Bull', to: '✓' }).kind).toBe('jump')
    expect(planChange({ ...base, from: '+2', to: '2' }).kind).toBe('jump')
  })

  it('rolls the way the number moves; the usual way is plain', () => {
    expect(planChange({ ...base, from: '141', to: '81' })).toEqual({ kind: 'roll', dir: 'down', tone: 'plain' })
    expect(planChange({ normal: 'up', from: '0', to: '60' })).toEqual({ kind: 'roll', dir: 'up', tone: 'plain' })
  })

  it('turns amber for a take-back (undo, correction)', () => {
    expect(planChange({ ...base, from: '36', to: '81' })).toEqual({ kind: 'roll', dir: 'up', tone: 'back' })
    expect(planChange({ normal: 'up', from: '60', to: '20' })).toEqual({ kind: 'roll', dir: 'down', tone: 'back' })
  })

  it('takes progress over the numbers when given (ATC in random order)', () => {
    expect(planChange({ normal: 'up', from: '17', to: '5', progress: 4, prevProgress: 3 })).toEqual({
      kind: 'roll',
      dir: 'down',
      tone: 'plain',
    })
    expect(planChange({ normal: 'up', from: '5', to: '17', progress: 3, prevProgress: 4 })).toEqual({
      kind: 'roll',
      dir: 'up',
      tone: 'back',
    })
  })

  it('a bust rolls back up in red', () => {
    expect(planChange({ ...base, from: '12', to: '32', bust: true, wasBust: false })).toEqual({ kind: 'roll', dir: 'up', tone: 'bust' })
  })

  it('a bust that leaves the score where it was still flashes and shakes', () => {
    expect(planChange({ ...base, from: '32', to: '32', bust: true, wasBust: false })).toEqual({ kind: 'roll', dir: 'down', tone: 'bust' })
    expect(planChange({ ...base, from: '32', to: '32', bust: true, wasBust: true }).kind).toBe('none')
  })

  it('undoing the busting dart is a take-back', () => {
    expect(planChange({ ...base, from: '32', to: '12', bust: false, wasBust: true })).toEqual({ kind: 'roll', dir: 'down', tone: 'back' })
  })

  it('the visit clearing after a bust is a take-back too, even before a new dart moves the score', () => {
    // Regression: the next visit opening (or its takeout) can reach the client before its first
    // dart does, leaving the score unchanged but no longer bust — it must not stay red till
    // whenever a later dart happens to change the number.
    expect(planChange({ ...base, from: '32', to: '32', bust: false, wasBust: true })).toEqual({ kind: 'roll', dir: 'down', tone: 'back' })
  })

  it('a bust in the same snapshot as a new leg just jumps, no red flash', () => {
    expect(planChange({ ...base, from: '32', to: '501', bust: true, wasBust: false, reset: true })).toEqual({
      kind: 'jump',
      dir: 'up',
      tone: 'plain',
    })
  })

  it('reduced motion jumps but keeps the colour', () => {
    expect(planChange({ ...base, from: '36', to: '81', reducedMotion: true })).toEqual({ kind: 'jump', dir: 'up', tone: 'back' })
    expect(planChange({ ...base, from: '12', to: '32', bust: true, reducedMotion: true })).toEqual({
      kind: 'jump',
      dir: 'up',
      tone: 'bust',
    })
  })
})
