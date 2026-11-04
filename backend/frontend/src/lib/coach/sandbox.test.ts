import { describe, it, expect } from 'vitest'
import { dartAt, dartFromLabel } from './sandbox'
import { coachOpenVisit, openVisitLeg } from '$shared/coach/openVisit'
import { REF } from '$shared/coach/testLegs'
import type { CoachDart } from '$shared/coach/walk'

const darts = (...names: string[]): CoachDart[] => names.map(n => dartFromLabel(n)!)
const solo = (start: number) => ({ start, opponent: null, average: 60 })

describe('dartFromLabel', () => {
  it('reads S/D/T 1–20, Bull, 25 and Miss in any case', () => {
    expect(dartFromLabel('t19')?.segment).toEqual({ name: 'T19', number: 19, multiplier: 3 })
    expect(dartFromLabel('Bull')?.segment).toEqual({ name: 'Bull', number: 50, multiplier: 1 })
    expect(dartFromLabel('25')?.segment).toEqual({ name: '25', number: 25, multiplier: 1 })
    expect(dartFromLabel('miss')?.segment).toEqual({ name: 'Miss', number: 0, multiplier: 0 })
  })

  it('refuses anything else', () => {
    for (const s of ['', 'T21', 'S0', 'D25', 'X5', '20']) expect(dartFromLabel(s)).toBeNull()
  })
})

describe('dartAt', () => {
  it('keeps the click as the dart position', () => {
    expect(dartAt({ x: 0, y: 0.6 })).toEqual({ segment: { name: 'T20', number: 20, multiplier: 3 }, coords: { x: 0, y: 0.6 } })
  })
})

describe('openVisitLeg', () => {
  it("puts the opponent's visit on their score before yours", () => {
    const leg = openVisitLeg({ start: 24, opponent: 32, average: 60 }, darts('S14'))
    expect(leg.visits).toEqual([
      { seat: 1, darts: [], scored: 0, remaining: 32, bust: false },
      { seat: 0, darts: darts('S14'), scored: 14, remaining: 10, bust: false },
    ])
  })

  it('marks a bust and keeps the start', () => {
    expect(openVisitLeg(solo(10), darts('T20')).visits[0]).toMatchObject({ scored: 0, remaining: 10, bust: true })
  })
})

describe('coachOpenVisit', () => {
  it('shows no visit and the best aims before the first dart', () => {
    const r = coachOpenVisit(solo(40), [], REF, REF, 5)
    expect(r).toMatchObject({ visit: null, left: 40, done: false })
    expect(r.next[0].aim.label).toBe('D20')
    expect(r.next).toHaveLength(5)
  })

  it('grades S20 on 57 with one dart Bad (97: S20, S20, S20)', () => {
    const r = coachOpenVisit(solo(97), darts('S20', 'S20', 'S20'), REF, REF, 5)
    expect(r.done).toBe(true)
    expect(r.next).toEqual([])
    expect(r.visit).toMatchObject({ grade: 'bad', tip: false })
    expect(r.visit!.text).toContain('S20 leaves 37')
    expect(r.visit!.notes.find(n => n.dart === 2)?.reason).toBe('S20 leaves 37, with no one-dart finish')
  })

  it('gives a tip for S14 on 24 solo', () => {
    const r = coachOpenVisit(solo(24), darts('S14'), REF, REF, 5)
    expect(r.visit).toMatchObject({ tip: true, text: 'Tip: On 24, S14: better D12.' })
    expect(r.visit!.notes[0]).toMatchObject({ thrown: 'S14', better: 'D12', tip: true })
    expect(r.done).toBe(false)
    expect(r.left).toBe(10)
    expect(r.next[0].aim.label).toBe('D5')
  })

  it('drops the tip when the opponent is on 32', () => {
    const r = coachOpenVisit({ start: 24, opponent: 32, average: 60 }, darts('S14'), REF, REF, 5)
    expect(r.visit!.notes[0]).toMatchObject({ thrown: 'S14', better: 'D12', tip: false })
    expect(r.visit).toMatchObject({ grade: 'bad', tip: false })
  })

  it('stops after a checkout', () => {
    expect(coachOpenVisit(solo(40), darts('D20'), REF, REF, 5)).toMatchObject({ done: true, left: 0, next: [] })
  })
})
