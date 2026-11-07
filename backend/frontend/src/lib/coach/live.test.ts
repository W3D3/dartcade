import { describe, it, expect } from 'vitest'
import type { Dart } from '$lib/api/game-ws'
import { liveAverage, liveCoach, shownVisit } from './live'
import { REF } from '$shared/coach/testLegs'
import { dartFromLabel } from './sandbox'

const MODELS = { model: REF, reference: REF.landing }

const darts = (...names: string[]): Dart[] =>
  names.map(n => {
    const { segment } = dartFromLabel(n)!
    return { segment: { ...segment, bed: 'Single', multiplier: segment.multiplier as Dart['segment']['multiplier'] }, score: 0 }
  })

describe('liveCoach', () => {
  it('on a finish: the three best aims with their chance and what they leave', () => {
    const c = liveCoach(MODELS, 40, [], 60)
    expect(c.scoring).toBe(false)
    expect(c.aims).toHaveLength(3)
    expect(c.aims[0]).toMatchObject({ label: 'D20', aimId: 'D20' })
    expect(c.aims[0].detail).toMatch(/^\d+% · checks out$/)
    expect(c.aims.every(a => /^\d+% · (checks out|leaves \d+|leaves \d+ or \d+|busts)$/.test(a.detail))).toBe(true)
  })

  it('over 170: the scoring aims by points a dart, T20 first', () => {
    const c = liveCoach(MODELS, 501, [], 60)
    expect(c.scoring).toBe(true)
    expect(c.aims.map(a => a.label)).toEqual(['T20', 'T19', 'T18'])
    expect(c.aims[0].detail).toMatch(/^\d+\.\d a dart$/)
  })

  it('switches to checkout aims once the visit gets to 170 or less', () => {
    const c = liveCoach(MODELS, 200, darts('T20'), 60)
    expect(c.left).toBe(140)
    expect(c.scoring).toBe(false)
  })

  it("lists the open visit's darts with their class and change", () => {
    const c = liveCoach(MODELS, 81, darts('T19', 'S12'), 60)
    expect(c.left).toBe(12)
    expect(c.visit?.darts.map(d => d.name)).toEqual(['T19', 'S12'])
    expect(c.visit?.darts[0].delta).toEqual(expect.any(Number))
    expect(c.done).toBe(false)
  })

  it('grades the visit once it is done, and offers no more aims', () => {
    const c = liveCoach(MODELS, 40, darts('D20'), 60)
    expect(c.aims).toEqual([])
    expect(c.done).toBe(true)
    expect(c.visit?.tags).toEqual(['doubling'])
  })

  it('has no change on a scoring visit', () => {
    const c = liveCoach(MODELS, 501, darts('T20', 'T20', 'T20'), 60)
    expect(c.visit?.darts.every(d => d.delta === null)).toBe(true)
    expect(c.done && c.visit?.tags).toEqual(['scoring'])
  })
})

describe('liveAverage', () => {
  it("takes the 30-day average, then the game's, then none", () => {
    expect(liveAverage(62.44, 100, 3).value).toBe(62.44)
    expect(liveAverage(62.44, 100, 3).line).toContain('30-day average, 62.4')
    expect(liveAverage(null, 120, 6)).toMatchObject({ value: 60 })
    expect(liveAverage(undefined, 0, 0).value).toBeNull()
  })
})

describe('shownVisit', () => {
  const done = liveCoach(MODELS, 40, darts('S20', 'S10', 'D5'), 60)
  it('shows the last finished visit until the next visit has a dart', () => {
    const last = shownVisit(null, done)
    expect(last).toBe(done.visit)
    expect(shownVisit(last, liveCoach(MODELS, 81, [], 60))).toBe(last)
    expect(shownVisit(last, liveCoach(MODELS, 81, darts('T19'), 60))).toBeNull()
  })
})
