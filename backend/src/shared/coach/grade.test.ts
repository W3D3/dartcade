import { describe, it, expect } from 'vitest'
import { classifyVisit, tagOf, type VisitFacts } from './grade.js'
import { strategyNotes } from './notes.js'
import { leg, visit } from './testLegs.js'
import { throwsOf } from './walk.js'

type Opts = { average?: number; lost?: boolean; opponentLeft?: number }

/** Seat 0's visit from `start`, after an opponent (seat 1) left on `opponentLeft` (default 501). */
function facts(start: number, names: string[], { average = 60, lost = false, opponentLeft = 501 }: Opts = {}): VisitFacts {
  const v = visit(0, start, names)
  const throws = throwsOf([leg([visit(1, opponentLeft, []), v])], 0, 501)
  return {
    start,
    throws,
    scored: v.scored,
    then: v.remaining,
    bust: v.bust,
    notes: strategyNotes(throws),
    average,
    lastVisitOfLostLeg: lost,
  }
}

const grade = (start: number, names: string[], opts?: Opts) => classifyVisit(facts(start, names, opts))

describe('tagOf', () => {
  it('is Scoring above 170, Doubling once a dart is on a one-dart finish, else Setup', () => {
    expect(tagOf(facts(171, ['S20', 'S20', 'S20']))).toBe('scoring')
    expect(tagOf(facts(100, ['S20', 'S20', 'S20']))).toBe('setup')
    // The third dart is thrown on 40
    expect(tagOf(facts(80, ['S20', 'S20', 'S20']))).toBe('doubling')
    expect(tagOf(facts(50, ['Bull']))).toBe('doubling')
  })
})

describe('scoring visits', () => {
  it('Mistake: under 26', () => {
    expect(grade(501, ['S20', 'S1', 'S1'])).toEqual({ tag: 'scoring', grade: 'mistake', text: 'Scored 22; your usual visit is 60.' })
  })

  it('Weak: 25 or more below the average, with the average rounded', () => {
    expect(grade(501, ['S20', 'S20', 'S20'], { average: 85.4 })).toEqual({
      tag: 'scoring',
      grade: 'weak',
      text: 'Scored 60; your usual visit is 85.',
    })
  })

  it('Weak: two darts at 20 drift into 1 or 5', () => {
    expect(grade(501, ['S20', 'S1', 'S5'], { average: 40 })).toEqual({
      tag: 'scoring',
      grade: 'weak',
      text: '2 darts drifted into 1 or 5.',
    })
  })

  it('one dart in 5 is not a spill', () => {
    expect(grade(501, ['S20', 'S20', 'S5'], { average: 40 }).grade).toBe('ok')
  })

  it('Great: 40 or more above the average, naming the trebles', () => {
    expect(grade(501, ['T20', 'T20', 'S20'])).toEqual({ tag: 'scoring', grade: 'great', text: 'Two trebles.' })
    expect(grade(501, ['T20', 'T20', 'T20'])).toEqual({ tag: 'scoring', grade: 'great', text: 'Three trebles.' })
    expect(grade(501, ['T20', 'S20', 'S20'])).toEqual({ tag: 'scoring', grade: 'great', text: 'Scored 100.' })
  })

  it('Good: 15 or more above the average', () => {
    expect(grade(501, ['T20', 'S20', 'S5'])).toEqual({ tag: 'scoring', grade: 'good', text: 'Scored 85.' })
  })

  it('OK: anything else', () => {
    expect(grade(501, ['S20', 'S20', 'S20'])).toEqual({ tag: 'scoring', grade: 'ok', text: 'Scored 60.' })
  })

  it('Mistake: a strategy note on a later dart, told from the note', () => {
    // From 177 the third dart is thrown on 57
    expect(grade(177, ['T20', 'T20', 'S20'])).toEqual({
      tag: 'scoring',
      grade: 'mistake',
      text: 'On 57, S20: better S17 — S20 leaves 37, with no one-dart finish.',
    })
  })

  it('a tip does not make a Mistake', () => {
    const f = facts(177, ['T20', 'T20', 'S20'])
    expect(f.notes).toHaveLength(1)
    expect(classifyVisit({ ...f, notes: f.notes.map(n => ({ ...n, tip: true })) })).toEqual({
      tag: 'scoring',
      grade: 'great',
      text: 'Two trebles.',
    })
  })
})

describe('setup visits', () => {
  it('Mistake: a strategy note, told from the note', () => {
    expect(grade(97, ['S20', 'S20', 'S20'])).toEqual({
      tag: 'setup',
      grade: 'mistake',
      text: 'On 57, S20: better S17 — S20 leaves 37, with no one-dart finish.',
    })
  })

  it('Mistake: a bust', () => {
    expect(grade(7, ['S20'])).toMatchObject({ tag: 'setup', grade: 'mistake' })
    expect(classifyVisit({ ...facts(7, ['S20']), notes: [] }).text).toBe('Busted on 7.')
  })

  it('a bust with its own strategy note is told from the note', () => {
    // 14 is nowhere near the S3 that 7 wants
    const f = facts(7, ['S14'])
    expect(f.bust).toBe(true)
    expect(f.notes.some(n => !n.tip)).toBe(true)
    const r = classifyVisit(f)
    expect(r).toMatchObject({ tag: 'setup', grade: 'mistake' })
    expect(r.text).toBe('On 7, S14: better S3 — S14 busts.')
  })

  it('Good: left a one-dart finish, with its route', () => {
    expect(grade(100, ['S20', 'S20', 'S20'])).toEqual({ tag: 'setup', grade: 'good', text: '40 left is a 1-dart finish (D20).' })
  })

  it('OK: anything else, with the route or none', () => {
    expect(grade(150, ['S20', 'S20', 'S20'])).toEqual({ tag: 'setup', grade: 'ok', text: '90 left is a 2-dart finish (T20 · D15).' })
    // (the S1 itself draws a note; without it the visit reads as left)
    expect(classifyVisit({ ...facts(170, ['S1', 'Miss', 'Miss']), notes: [] })).toEqual({
      tag: 'setup',
      grade: 'ok',
      text: '169 left: no 3-dart finish.',
    })
  })
})

describe('doubling visits', () => {
  it('Great: checked out', () => {
    expect(grade(32, ['D16'])).toEqual({ tag: 'doubling', grade: 'great', text: 'Checked out on D16.' })
    expect(grade(50, ['Bull'])).toEqual({ tag: 'doubling', grade: 'great', text: 'Checked out on the bull.' })
  })

  it('Mistake: a bust beats everything, even a missed match dart that left a double', () => {
    const f = facts(40, ['S20', 'S20'], { lost: true })
    expect(f.bust).toBe(true)
    expect(classifyVisit({ ...f, notes: [] })).toEqual({ tag: 'doubling', grade: 'mistake', text: 'Missed the match dart. Busted on 20.' })
  })

  it('Mistake: a strategy note that is not a tip', () => {
    // 24 left: S14 instead of the direct D12, with the opponent on 32
    const r = grade(24, ['S14', 'Miss', 'Miss'], { opponentLeft: 32 })
    expect(r).toMatchObject({ tag: 'doubling', grade: 'mistake' })
    expect(r.text).toMatch(/^On 24, S14: better D12/)
  })

  it('a tip does not make a Mistake', () => {
    // The same S14 on 24 with nobody on an out
    const f = facts(24, ['S14', 'D5'])
    expect(f.notes.some(n => n.tip)).toBe(true)
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'great', text: 'Checked out on D5.' })
  })

  it('Mistake: a missed match dart that left no double', () => {
    expect(grade(40, ['S20', 'S10', 'S5'], { lost: true })).toEqual({
      tag: 'doubling',
      grade: 'mistake',
      text: 'Missed the match dart. 3 darts at D20, D10, and D5 missed.',
    })
  })

  it('Weak: a missed match dart that still left a double', () => {
    expect(grade(52, ['S12', 'Miss'], { lost: true })).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: 'Missed the match dart. 1 dart at D20 missed.',
    })
  })

  it('Weak: two or more darts at a double, none hit', () => {
    expect(grade(32, ['Miss', 'Miss', 'Miss'])).toEqual({ tag: 'doubling', grade: 'weak', text: '3 darts at D16 missed.' })
  })

  it('Weak: chased down to 4 or 2 by single-half misses', () => {
    expect(grade(32, ['S16', 'S8', 'S4'])).toEqual({ tag: 'doubling', grade: 'weak', text: 'Chased down to 4.' })
    expect(grade(8, ['S4', 'Miss', 'S2'])).toEqual({ tag: 'doubling', grade: 'weak', text: 'Chased down to 2.' })
  })

  it('not chased down from below 6, or by a dart outside the single half', () => {
    expect(grade(4, ['S2', 'Miss', 'Miss']).text).toBe('3 darts at D2 and D1 missed.')
    expect(grade(16, ['S4', 'S4', 'S4']).text).toBe('3 darts at D8, D6, and D4 missed.')
  })

  it('OK: one dart at a double missed', () => {
    expect(grade(52, ['S12', 'Miss'])).toEqual({ tag: 'doubling', grade: 'ok', text: '1 dart at D20 missed.' })
  })
})
