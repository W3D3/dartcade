import { describe, it, expect } from 'vitest'
import { segAngle, segmentAt } from '../board.js'
import {
  classifyVisit,
  closeness,
  dartGrade,
  explainedNote,
  GOOD_FROM,
  MISS_CLOSE_MAX,
  MISS_CLOSE_ZERO_MM,
  OK_FROM,
  tagOf,
  WEAK_FROM,
  type VisitFacts,
} from './grade.js'
import { classifyDart } from './dartClass.js'
import { strategyNotes, throwEvaluations } from './notes.js'
import { leg, visit, REF } from './testLegs.js'
import { dartDeltas } from './value.js'
import { throwsOf, type CoachDart, type CoachVisit } from './walk.js'

type Opts = { average?: number; lost?: boolean; opponentLeft?: number; visit?: CoachVisit }

/** Seat 0's visit from `start`, after an opponent (seat 1) left on `opponentLeft` (default 501). */
function facts(start: number, names: string[], { average = 60, lost = false, opponentLeft = 501, visit: given }: Opts = {}): VisitFacts {
  const v = given ?? visit(0, start, names)
  const throws = throwsOf([leg([visit(1, opponentLeft, []), v])], 0, 501, REF)
  const evaluate = throwEvaluations(REF)
  return {
    start,
    throws,
    scored: v.scored,
    then: v.remaining,
    bust: v.bust,
    classes: throws.map(t => classifyDart(t, { evaluation: evaluate(t) })),
    deltas: start > 170 ? [] : dartDeltas(throws, evaluate, REF),
    notes: strategyNotes(throws, REF, evaluate),
    average,
    first: start === 501,
    lastVisitOfLostLeg: lost,
    grouping: null,
  }
}

/** The facts with the busting dart's class forced to a Bust-back */
const bustBack = (f: VisitFacts): VisitFacts => ({ ...f, classes: [...f.classes.slice(0, -1), { ...f.classes.at(-1)!, kind: 'bustBack' }] })

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
    expect(grade(501, ['T20', 'T20', 'T5'])).toEqual({ tag: 'scoring', grade: 'great', text: 'Three trebles.' })
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

describe('setup and doubling visits: graded by value', () => {
  /** The visit's grade points: its darts' value changes plus their closeness credits */
  const points = (f: VisitFacts) => f.deltas.reduce((s, d, i) => s + dartGrade(d, closeness(f.classes[i])), 0)

  it("marks a tip's text as a tip, and only that", () => {
    const f = facts(113, ['S20', 'S20', 'S20'])
    expect(f.notes.length).toBeGreaterThan(0)
    const r = classifyVisit({ ...f, notes: f.notes.map(n => ({ ...n, tip: true })) })
    expect(r).toMatchObject({ tag: 'setup', tip: true, grade: classifyVisit({ ...f, notes: [] }).grade })
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

  it('a bust is graded by its value: it goes back to the start', () => {
    expect(grade(7, ['S20'])).toMatchObject({ tag: 'setup', grade: 'mistake' })
    expect(classifyVisit({ ...facts(7, ['S20']), notes: [] }).text).toBe('Busted on 7.')
    expect(classifyVisit({ ...facts(2, ['S1']), notes: [] })).toEqual({ tag: 'doubling', grade: 'mistake', text: 'Busted on 2.' })
  })

  it('busting back to 32 beats leaving 2', () => {
    // From 32: S16, then a T8 at D8 busts back to 32; S16, S8, S6 leaves D1 (notes left out)
    const bust = { ...facts(32, ['S16', 'T8']), notes: [] }
    const two = { ...facts(32, ['S16', 'S8', 'S6']), notes: [] }
    expect(two.then).toBe(2)
    expect(points(bust)).toBeGreaterThan(points(two))
    expect(classifyVisit(bust)).toEqual({ tag: 'doubling', grade: 'weak', text: 'Busted on 16.' })
    expect(classifyVisit(two)).toMatchObject({ grade: 'mistake' })
  })

  it('a Bust-back is told as one, graded by its value', () => {
    expect(classifyVisit({ ...bustBack(facts(7, ['S20'])), notes: [] })).toMatchObject({ text: 'Busted on purpose to stay on 7.' })
    // On 20: S10 at D10, then S7 (a tip: better D5) leaves 3, and S5 busts back to 20
    const f = facts(20, ['S10', 'S7', 'S5'])
    expect(f.classes.map(c => c.kind)).toEqual(['double', 'route', 'bustBack'])
    expect(f.notes.map(n => n.tip)).toEqual([true])
    expect(points(f)).toBeLessThan(OK_FROM)
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'weak', text: 'Busted on purpose to stay on 20 (D10).' })
    // The same darts, the last a plain bust: the same value
    expect(classifyVisit({ ...f, classes: [...f.classes.slice(0, 2), { ...f.classes[2], kind: 'bust' }] })).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: 'Busted on 3.',
    })
    expect(classifyVisit({ ...bustBack(facts(50, ['S25', 'S20', 'S10'])), notes: [] })).toMatchObject({
      text: 'Busted on purpose to stay on 50 (the bull).',
    })
  })

  it('Mistake: a strategy note that is not a tip', () => {
    // 24 left: S14 instead of the direct D12, with the opponent on 32
    const r = grade(24, ['S14', 'Miss', 'Miss'], { opponentLeft: 32 })
    expect(r).toMatchObject({ tag: 'doubling', grade: 'mistake' })
    expect(r.text).toMatch(/^On 24, S14: better D12/)
    expect(r.tip).toBeUndefined()
  })

  it('a tip speaks for the visit, its grade left to the value', () => {
    const f = facts(24, ['S14', 'Miss', 'Miss'])
    const r = classifyVisit(f)
    expect(r).toMatchObject({ tag: 'doubling', grade: classifyVisit({ ...f, notes: [] }).grade, tip: true })
    expect(r.text).toMatch(/^Tip: On 24, S14: better D12/)
    expect(grade(24, ['S14', 'Miss', 'Miss'], { lost: true }).text).toMatch(/^Missed the match dart\. Tip: On 24, S14/)
    // A checkout keeps its own line
    expect(grade(24, ['S14', 'D5'])).toMatchObject({ tag: 'doubling', text: 'Checked out on D5.' })
  })

  it('59 → Miss, S3, S19: the darts gave away the finish, told from the costliest', () => {
    // (typed, the S19 on 56 also draws a note, which would speak first; the real visit had none)
    const f = { ...facts(59, ['Miss', 'S3', 'S19']), notes: [] }
    expect(points(f)).toBeLessThan(WEAK_FROM)
    expect(classifyVisit(f)).toEqual({
      tag: 'setup',
      grade: 'mistake',
      text: 'S19 on 56 cost 15% checkout chance: 37 left is a 2-dart finish (S5 · D16).',
    })
  })

  it('121 → S20, T17, S18: a good setup to D16', () => {
    const f = facts(121, ['S20', 'T17', 'S18'])
    expect(points(f)).toBeGreaterThanOrEqual(GOOD_FROM)
    expect(classifyVisit(f)).toEqual({ tag: 'doubling', grade: 'good', text: '32 left is a 1-dart finish (D16).' })
  })

  it('a checkout is told by its double', () => {
    expect(grade(32, ['S16', 'D8'])).toEqual({ tag: 'doubling', grade: 'good', text: 'Checked out on D8.' })
    expect(grade(76, ['S20', 'S16', 'D20'])).toEqual({ tag: 'doubling', grade: 'great', text: 'Checked out on D20.' })
    expect(grade(50, ['Miss', 'Bull'])).toMatchObject({ text: 'Checked out on the bull.' })
  })

  it('a flat or better visit says what it left, a worse one leads with its costliest dart', () => {
    expect(grade(170, ['T20', 'T20', 'S25'])).toEqual({ tag: 'doubling', grade: 'great', text: '25 left is a 2-dart finish (S9 · D8).' })
    expect(grade(150, ['S20', 'S20', 'S20'])).toEqual({
      tag: 'setup',
      grade: 'weak',
      text: 'S20 on 110 cost 7% checkout chance: 90 left is a 2-dart finish (T20 · D15).',
    })
    expect(classifyVisit({ ...facts(170, ['S1', 'Miss', 'Miss']), notes: [] }).text).toMatch(/: 169 left: no 3-dart finish\.$/)
  })

  it('three darts missed at the double: Weak', () => {
    expect(grade(32, ['Miss', 'Miss', 'Miss'])).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: 'Miss on 32 cost 9% checkout chance: 32 left is a 1-dart finish (D16).',
    })
  })

  it('a dart that missed its target grades higher the closer it was', () => {
    // On the 16 wedge's centre line, just outside the double: 2 mm and 25 mm off its bed
    const at = (mm: number): CoachDart => {
      const r = (170 + mm) / 170
      const p = { x: r * Math.cos(segAngle(13)), y: r * Math.sin(segAngle(13)) }
      const { name, number, multiplier } = segmentAt(p.x, p.y)
      return { segment: { name, number, multiplier }, coords: p }
    }
    const placed = (mm: number) =>
      facts(32, [], { visit: { seat: 0, darts: [at(mm), at(mm), at(mm)], scored: 0, remaining: 32, bust: false } })
    const near = placed(2)
    const far = placed(25)
    expect(near.classes.map(c => c.kind)).toEqual(['double', 'double', 'double'])
    expect(near.deltas).toEqual(far.deltas)
    expect(closeness(near.classes[0])).toBeCloseTo(MISS_CLOSE_MAX * (1 - 2 / MISS_CLOSE_ZERO_MM))
    expect(closeness(far.classes[0])).toBe(0)
    // A hit and a typed dart earn none
    expect(closeness(facts(32, ['D16']).classes[0])).toBeNull()
    expect(closeness(facts(32, ['Miss']).classes[0])).toBeNull()
    expect(points(near)).toBeGreaterThan(points(far))
    expect(classifyVisit(near).grade).toBe('ok')
    expect(classifyVisit(far).grade).toBe('weak')
  })

  it('the match dart: a dart at the double on the last visit of a lost leg', () => {
    expect(grade(52, ['S12', 'Miss'], { lost: true }).text).toMatch(/^Missed the match dart\. /)
    expect(classifyVisit({ ...facts(40, ['S20', 'S20'], { lost: true }), notes: [] })).toEqual({
      tag: 'doubling',
      grade: 'weak',
      text: 'Missed the match dart. Busted on 20.',
    })
    // Never on a setup: no dart went at a double
    expect(grade(150, ['S20', 'S20', 'S20'], { lost: true }).text).not.toMatch(/match dart/)
  })
})

describe('Perfect: the visit keeps the fewest-darts finish', () => {
  const perfect = (start: number, names: string[]) => grade(start, names).grade === 'perfect'

  it('scoring visits that leave a finish in the fewest darts', () => {
    expect(grade(501, ['T20', 'T19', 'T19'])).toEqual({ tag: 'scoring', grade: 'perfect', text: 'Nine-darter still on.' })
    expect(grade(501, ['T20', 'T20', 'T17']).text).toBe('Nine-darter still on.')
    expect(perfect(501, ['T20', 'T20', 'T20'])).toBe(true)
    // 361 needs 7
    expect(perfect(501, ['T20', 'T20', 'S20'])).toBe(false)
    expect(grade(211, ['T20', 'T20', 'T17'])).toEqual({
      tag: 'scoring',
      grade: 'perfect',
      text: 'Scored 171: 40 left is still a 1-dart finish, the fewest possible.',
    })
    expect(perfect(211, ['T20', 'T19', 'T20'])).toBe(true)
    // 31 is a 2-dart finish: 5 darts from 211, not 4
    expect(perfect(211, ['T20', 'T20', 'T20'])).toBe(false)
  })

  it('the nine-darter line only on the seat first visit', () => {
    expect(classifyVisit({ ...facts(501, ['T20', 'T20', 'T20']), first: false }).text).toBe(
      'Scored 180: 321 left is still a 6-dart finish, the fewest possible.',
    )
  })

  it('checkouts in the fewest darts', () => {
    expect(grade(40, ['D20'])).toEqual({ tag: 'doubling', grade: 'perfect', text: 'Checked out in the fewest darts (D20).' })
    expect(grade(40, ['S20', 'D10']).grade).not.toBe('perfect')
    expect(grade(100, ['T20', 'D20']).text).toBe('Checked out in the fewest darts (D20).')
    expect(grade(170, ['T20', 'T20', 'Bull']).text).toBe('Checked out in the fewest darts (the bull).')
  })

  it('a setup visit can be Perfect', () => {
    expect(grade(169, ['T20', 'T19', 'S12'])).toMatchObject({ tag: 'setup', grade: 'perfect' })
  })

  it('never on a bust; a strategy note wins, a tip does not', () => {
    expect(perfect(40, ['T20'])).toBe(false)
    // 98 → T20 D19: the fewest; a forced note keeps it a Mistake, a tip leaves it Perfect
    const f = facts(98, ['T20', 'D19'])
    expect(classifyVisit(f).grade).toBe('perfect')
    const note = { ...explainedNote(facts(24, ['S14', 'D5']).notes)!, tip: false }
    expect(classifyVisit({ ...f, notes: [note] }).grade).toBe('mistake')
    expect(classifyVisit({ ...f, notes: [{ ...note, tip: true as const }] }).grade).toBe('perfect')
  })
})
