import { describe, it, expect } from 'vitest'
import { classifyVisit, doubleDepth, explainedNote, tagOf, type VisitFacts } from './grade.js'
import { classifyDart } from './dartClass.js'
import { strategyNotes, throwEvaluations } from './notes.js'
import { leg, visit } from './testLegs.js'
import { throwsOf } from './walk.js'

type Opts = { average?: number; lost?: boolean; opponentLeft?: number }

/** Seat 0's visit from `start`, after an opponent (seat 1) left on `opponentLeft` (default 501). */
function facts(start: number, names: string[], { average = 60, lost = false, opponentLeft = 501 }: Opts = {}): VisitFacts {
  const v = visit(0, start, names)
  const throws = throwsOf([leg([visit(1, opponentLeft, []), v])], 0, 501)
  const evaluate = throwEvaluations()
  return {
    start,
    throws,
    scored: v.scored,
    then: v.remaining,
    bust: v.bust,
    classes: throws.map(t => classifyDart(t, { evaluation: evaluate(t) })),
    notes: strategyNotes(throws, evaluate),
    average,
    lastVisitOfLostLeg: lost,
    grouping: null,
  }
}

/** The facts with the busting dart's class forced to a Bust-back */
const bustBack = (f: VisitFacts): VisitFacts => ({ ...f, classes: [...f.classes.slice(0, -1), { kind: 'bustBack', plannedLeave: null }] })

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

  it('grades the rating, not the raw score, and says when the grouping lifted the grade', () => {
    const rated = (names: string[], rating: number, average = 60) => ({
      ...facts(501, names, { average }),
      grouping: { spreadMm: 6, edgeMm: 2, rating, comment: { level: 'great' as const, text: 'Great grouping' } },
    })
    // 60 is OK on a 60 average; rated 80 it is Good
    expect(classifyVisit(rated(['S20', 'S20', 'S20'], 80))).toEqual({
      tag: 'scoring',
      grade: 'good',
      text: 'Scored 60, great grouping (6 mm), close to the target (2 mm).',
    })
    // 45 is Weak on a 70 average; rated 60 it is OK
    expect(classifyVisit(rated(['S20', 'S20', 'S5'], 60, 70))).toMatchObject({ grade: 'ok', text: expect.stringMatching(/^Scored 45, /) })
    // A rating that leaves the grade alone keeps the plain text
    expect(classifyVisit(rated(['S20', 'S20', 'S20'], 70))).toEqual({ tag: 'scoring', grade: 'ok', text: 'Scored 60.' })
  })

  it('a tight group never rescues a very low score', () => {
    expect(classifyVisit({ ...facts(501, ['S5', 'S5', 'S5']), grouping: { spreadMm: 2, edgeMm: 1, rating: 37, comment: null } })).toEqual({
      tag: 'scoring',
      grade: 'mistake',
      text: 'Scored 15; your usual visit is 60.',
    })
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

describe('explainedNote', () => {
  const [n] = facts(97, ['S20', 'S20', 'S20']).notes
  it('takes the costliest note that is no tip, a tip only without one', () => {
    const tip = { ...n, tip: true, cost: 0.9 }
    const small = { ...n, tip: false, cost: 0.1 }
    const big = { ...n, tip: false, cost: 0.2 }
    expect(explainedNote([tip, small, big])).toBe(big)
    expect(explainedNote([tip])).toBe(tip)
    expect(explainedNote([])).toBeNull()
  })

  it('is the note the visit text quotes', () => {
    const f = facts(97, ['S20', 'S20', 'S20'])
    const costlier = { ...f.notes[0], cost: f.notes[0].cost + 0.1, better: 'S7' }
    expect(classifyVisit({ ...f, notes: [...f.notes, costlier] }).text).toMatch(/^On 57, S20: better S7/)
  })
})

describe('setup visits', () => {
  it("marks a tip's text as a tip, and only that", () => {
    const f = facts(97, ['S20', 'S20', 'S20'])
    const r = classifyVisit({ ...f, notes: f.notes.map(n => ({ ...n, tip: true })) })
    expect(r).toMatchObject({ tag: 'setup', tip: true })
    expect(r.text).toMatch(/^Tip: /)
    expect(classifyVisit(f).tip).toBeUndefined()
  })

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

  it('OK: a Bust-back, staying on a score with no one-dart finish', () => {
    expect(classifyVisit({ ...bustBack(facts(7, ['S20'])), notes: [] })).toEqual({
      tag: 'setup',
      grade: 'ok',
      text: 'Busted on purpose to stay on 7.',
    })
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

  it('OK: a Bust-back, its own line over a tip on an earlier dart', () => {
    // On 20: S10 at D10, then S7 (a route, and a tip: better D5) leaves 3, and S5 busts back to 20
    const f = facts(20, ['S10', 'S7', 'S5'])
    expect(f.classes.map(c => c.kind)).toEqual(['double', 'route', 'bustBack'])
    expect(f.notes.map(n => n.tip)).toEqual([true])
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'ok', text: 'Busted on purpose to stay on 20 (D10).' })
    // The same darts, the last a plain bust
    expect(
      classifyVisit({ ...f, classes: (['double', 'route', 'bust'] as const).map(kind => ({ kind, plannedLeave: null })) }),
    ).toMatchObject({ grade: 'mistake', tip: true })
  })

  it('a Bust-back still answers to the missed-doubles rules: S10 and S5 at D10 and D5, then T20', () => {
    const f = facts(20, ['S10', 'S5', 'T20'])
    expect(f.classes.map(c => c.kind)).toEqual(['double', 'double', 'bustBack'])
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'weak', text: '2 darts at D10 and D5 missed.' })
  })

  it('a Bust-back on a missed match dart grades as the match dart does', () => {
    expect(grade(20, ['S10', 'S5', 'T20'], { lost: true })).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: 'Missed the match dart. 2 darts at D10 and D5 missed.',
    })
    // One dart at the double (S7 set up the bust), but the match dart: Weak, told from S7's tip
    expect(grade(20, ['S10', 'S7', 'S5'], { lost: true })).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: "Missed the match dart. Tip: On 10, S7: better D5 — S7 leaves 3, which one dart can't finish.",
      tip: true,
    })
  })

  it('a Bust-back on 50 stays on the bull', () => {
    expect(classifyVisit({ ...bustBack(facts(50, ['S25', 'S20', 'S10'])), notes: [] })).toMatchObject({
      grade: 'ok',
      text: 'Busted on purpose to stay on 50 (the bull).',
    })
  })

  it('Mistake: a Bust-back visit with a strategy note that is not a tip', () => {
    const f = facts(40, ['S20', 'S19'])
    expect(classifyVisit(bustBack(f))).toMatchObject({ grade: 'mistake', text: 'On 20, S19: better D10 — S19 busts.' })
  })

  it('Mistake: a strategy note that is not a tip', () => {
    // 24 left: S14 instead of the direct D12, with the opponent on 32
    const r = grade(24, ['S14', 'Miss', 'Miss'], { opponentLeft: 32 })
    expect(r).toMatchObject({ tag: 'doubling', grade: 'mistake' })
    expect(r.text).toMatch(/^On 24, S14: better D12/)
    expect(r.tip).toBeUndefined()
  })

  it('a tip speaks for the visit, its grade left to the doubling rules', () => {
    // The same S14 on 24 with nobody on an out, then two misses at D5: Weak as any 3 missed darts
    const r = grade(24, ['S14', 'Miss', 'Miss'])
    expect(r).toMatchObject({ tag: 'doubling', grade: 'weak', tip: true })
    expect(r.text).toMatch(/^Tip: On 24, S14: better D12/)
    expect(grade(24, ['S14', 'Miss', 'Miss'], { lost: true }).text).toMatch(/^Missed the match dart\. Tip: On 24, S14/)
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
    // S4 on 16 is also a tip (D8 straight away), which then speaks for the visit. The split to D6 is
    // to a worse double, so it counts as a dart at D8; the one from 12 to D4 is to a better one: Weak
    expect(grade(16, ['S4', 'S4', 'S4'])).toMatchObject({ grade: 'weak', tip: true, text: 'Tip: On 16, S4: better D8.' })
  })

  it('a double survives as many single-half misses as it halves to another double', () => {
    expect([2, 4, 8, 12, 16, 32, 38, 40, 50].map(doubleDepth)).toEqual([0, 1, 2, 1, 3, 4, 0, 2, 0])
  })

  it('a split to a worse double is a dart at the double: 16 → S4 left D6, worse than D8', () => {
    const f = facts(16, ['S4', 'Miss', 'Miss'])
    expect(f.classes.map(c => c.kind)[0]).toBe('split')
    expect(classifyVisit(f)).toMatchObject({ grade: 'weak' })
    expect(classifyVisit(f).text).toContain('D8')
  })

  it('a split to a better double is not: 12 → S4 leaves D4, which survives more misses than D6', () => {
    const f = facts(12, ['S4', 'D4'])
    expect(f.classes.map(c => c.kind)).toEqual(['split', 'double'])
    expect(classifyVisit(f)).toMatchObject({ grade: 'great' })
  })

  it('a split is no dart at the double: 38 → S6, S16, S8 missed D16 and D8 only', () => {
    const f = facts(38, ['S6', 'S16', 'S8'])
    expect(f.classes.map(c => c.kind)).toEqual(['split', 'double', 'double'])
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'weak', text: '2 darts at D16 and D8 missed.' })
  })

  it('a typed miss on a double is a dart at it', () => {
    const f = facts(32, ['Miss', 'S16'])
    expect(f.classes.map(c => c.kind)).toEqual(['double', 'double'])
    expect(classifyVisit(f).text).toBe('2 darts at D16 missed.')
  })

  it('Mistake: a Bust-back on a missed match dart that left no double', () => {
    // On 15: S9 sets up D3, S3 misses it, T20 busts back to 15
    const f = facts(15, ['S9', 'S3', 'T20'], { lost: true })
    expect(f.classes.map(c => c.kind)).toEqual(['route', 'double', 'bustBack'])
    expect(classifyVisit({ ...f, notes: [] })).toEqual({
      tag: 'doubling',
      grade: 'mistake',
      text: 'Missed the match dart. 1 dart at D3 missed.',
    })
  })

  it('OK: one dart at a double missed', () => {
    expect(grade(52, ['S12', 'Miss'])).toEqual({ tag: 'doubling', grade: 'ok', text: '1 dart at D20 missed.' })
  })
})
