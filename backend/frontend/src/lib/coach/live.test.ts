import { describe, it, expect } from 'vitest'
import type { Dart } from '$lib/api/game-ws'
import { AIMS } from '$shared/coach/aims'
import { aimPoints, keepGrade, liveAverage, liveCoach } from './live'
import { REF } from '$shared/coach/testLegs'
import { dartFromLabel } from './sandbox'

const darts = (...names: string[]): Dart[] =>
  names.map(n => {
    const { segment } = dartFromLabel(n)!
    return { segment: { ...segment, bed: 'Single', multiplier: segment.multiplier as Dart['segment']['multiplier'] }, score: 0 }
  })
const aim = (id: string) => AIMS.find(a => a.id === id)!

describe('aimPoints', () => {
  it('scores each aim where it is aimed, both numbers of a wire', () => {
    expect(aimPoints(aim('T20'))).toEqual([60])
    expect(aimPoints(aim('D16'))).toEqual([32])
    expect(aimPoints(aim('SO5'))).toEqual([5])
    expect(aimPoints(aim('W20-1'))).toEqual([20, 1])
    expect(aimPoints(aim('Bull'))).toEqual([50])
    expect(aimPoints(aim('25'))).toEqual([25])
  })
})

describe('liveCoach', () => {
  it('on a finish: the three best aims with their chance and what they leave', () => {
    const c = liveCoach(REF, 40, [], 60)
    expect(c.scoring).toBe(false)
    expect(c.aims).toHaveLength(3)
    expect(c.aims[0]).toMatchObject({ label: 'D20', aimId: 'D20' })
    expect(c.aims[0].detail).toMatch(/^\d+% · checks out$/)
    expect(c.aims.every(a => /^\d+% · (checks out|leaves \d+|leaves \d+ or \d+|busts)$/.test(a.detail))).toBe(true)
  })

  it('over 170: the scoring aims by points a dart, T20 first', () => {
    const c = liveCoach(REF, 501, [], 60)
    expect(c.scoring).toBe(true)
    expect(c.aims.map(a => a.label)).toEqual(['T20', 'T19', 'T18'])
    expect(c.aims[0].detail).toMatch(/^\d+\.\d a dart$/)
  })

  it('switches to checkout aims once the visit gets to 170 or less', () => {
    const c = liveCoach(REF, 200, darts('T20'), 60)
    expect(c.left).toBe(140)
    expect(c.scoring).toBe(false)
  })

  it("lists the open visit's darts with their class, change and closeness", () => {
    const c = liveCoach(REF, 81, darts('T19', 'S12'), 60)
    expect(c.left).toBe(12)
    expect(c.rows.map(r => r.name)).toEqual(['T19', 'S12'])
    expect(c.rows[0].label).toBeTruthy()
    expect(c.rows[0].delta).toMatch(/^(0|[+−]\d+)$/)
    expect(c.graded).toBeNull()
  })

  it('grades the visit once it is done, and offers no more aims', () => {
    const c = liveCoach(REF, 40, darts('D20'), 60)
    expect(c.aims).toEqual([])
    expect(c.graded).toMatchObject({ tag: 'doubling', darts: 'D20' })
  })

  it('has no change on a scoring visit', () => {
    const c = liveCoach(REF, 501, darts('T20', 'T20', 'T20'), 60)
    expect(c.rows.every(r => r.delta === null)).toBe(true)
    expect(c.graded?.tag).toBe('scoring')
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

describe('keepGrade', () => {
  const done = liveCoach(REF, 40, darts('S20', 'S10', 'D5'), 60)
  it('keeps the last grade until the next visit has a dart', () => {
    expect(done.graded).not.toBeNull()
    const kept = keepGrade(null, done)
    expect(keepGrade(kept, liveCoach(REF, 81, [], 60))).toBe(kept)
    expect(keepGrade(kept, liveCoach(REF, 81, darts('T19'), 60))).toBeNull()
  })
})
