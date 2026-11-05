import { describe, it, expect } from 'vitest'
import { SEGS, segAngle, segmentAt } from '../board.js'
import {
  BRILLIANT_CHANCE,
  BUST_DART_LOST,
  closeness,
  bandOf,
  bustPenalty,
  dartGrade,
  EXCELLENT_FROM,
  explainedNote,
  FINISH_BANDS,
  FINISH_SCALE,
  GOOD_FROM,
  MISS_CLOSE_MAX,
  MISS_CLOSE_ZERO_MM,
  OK_FROM,
  SCORING_BANDS,
  SCORING_SCALE,
  tagOf,
  WEAK_FROM,
  type VisitFacts,
} from './grade.js'
import { classifyDart } from './dartClass.js'
import { classifyVisit, routeShape } from './visitText.js'
import { fewestPath } from './minDarts.js'
import { strategyNotes, throwEvaluations } from './notes.js'
import { leg, seg, visit, REF } from './testLegs.js'
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
    fewest: fewestPath(REF.landing, start, throws.length, v.remaining, v.bust),
  }
}

/** The facts with the busting dart's class forced to a Bust-back */
const bustBack = (f: VisitFacts): VisitFacts => ({ ...f, classes: [...f.classes.slice(0, -1), { ...f.classes.at(-1)!, kind: 'bustBack' }] })

const grade = (start: number, names: string[], opts?: Opts) => classifyVisit(facts(start, names, opts))

describe('bandOf', () => {
  it('takes the first class whose lower bound the points reach, Bad below the last', () => {
    expect(bandOf(EXCELLENT_FROM, FINISH_BANDS)).toBe('excellent')
    expect(bandOf(EXCELLENT_FROM - 0.1, FINISH_BANDS)).toBe('great')
    expect(bandOf(0, FINISH_BANDS)).toBe('ok')
    expect(bandOf(OK_FROM - 0.1, FINISH_BANDS)).toBe('inaccuracy')
    expect(bandOf(WEAK_FROM, FINISH_BANDS)).toBe('weak')
    expect(bandOf(WEAK_FROM - 0.1, FINISH_BANDS)).toBe('bad')
    expect(bandOf(0, SCORING_BANDS)).toBe('ok')
    expect(bandOf(-100, SCORING_BANDS)).toBe('bad')
  })
})

describe('routeShape', () => {
  it('names a route by its beds, a single double a one-dart finish', () => {
    expect(routeShape(['D16'])).toBe('one-dart finish')
    expect(routeShape(['Bull'])).toBe('one-dart finish')
    expect(routeShape(['S16', 'D16'])).toBe('single to double')
    expect(routeShape(['T20', 'D8'])).toBe('treble to double')
    expect(routeShape(['25', 'D20'])).toBe('single bull to double')
    expect(routeShape(['T20', 'S11', 'Bull'])).toBe('treble to single to bull')
    expect(routeShape(['T20', 'T20', 'Bull'])).toBe('treble to treble to bull')
    expect(routeShape(['S20', 'T20', 'D20'])).toBe('single to treble to double')
    expect(routeShape(['T20', 'T19', 'D12'])).toBe('treble to treble to double')
  })
})

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
  it('Bad: 30 or more below the average', () => {
    expect(grade(501, ['S20', 'S1', 'S1'])).toMatchObject({
      tag: 'scoring',
      grade: 'bad',
      text: 'Scored 22; your usual visit is 60.',
      tip: false,
    })
  })

  it('Weak: 15 to 30 below the average, with the average rounded', () => {
    expect(grade(501, ['S20', 'S20', 'S20'], { average: 85.4 })).toMatchObject({
      tag: 'scoring',
      grade: 'weak',
      text: 'Scored 60; your usual visit is 85.',
      tip: false,
    })
  })

  it('Inaccuracy at best: two darts at 20 drift into 1 or 5', () => {
    expect(grade(501, ['S20', 'S1', 'S5'], { average: 40 })).toMatchObject({
      tag: 'scoring',
      grade: 'inaccuracy',
      text: '2 darts drifted into 1 or 5.',
      value: { points: -14, rule: null },
    })
    // A spill caps a visit the value puts higher, and says so
    expect(grade(501, ['T20', 'S1', 'S5'], { average: 40 })).toMatchObject({ grade: 'inaccuracy', value: { points: 26, rule: 'spill' } })
  })

  it('Inaccuracy: 5 to 15 below the average', () => {
    expect(grade(501, ['S20', 'S20', 'S10'], { average: 60 })).toMatchObject({
      grade: 'inaccuracy',
      text: 'Scored 50; your usual visit is 60.',
    })
  })

  it('one dart in 5 is not a spill', () => {
    expect(grade(501, ['S20', 'S20', 'S5'], { average: 40 }).grade).toBe('ok')
  })

  it('Excellent: 50 or more above the average, Great 25 or more, naming the trebles', () => {
    expect(grade(501, ['T20', 'T20', 'S20'])).toMatchObject({ tag: 'scoring', grade: 'excellent', text: 'Two trebles.', tip: false })
    expect(grade(501, ['T20', 'T20', 'T5'])).toMatchObject({ tag: 'scoring', grade: 'excellent', text: 'Three trebles.', tip: false })
    expect(grade(501, ['T20', 'S20', 'S20'])).toMatchObject({ tag: 'scoring', grade: 'great', text: 'Scored 100.', tip: false })
    expect(grade(501, ['T20', 'S20', 'S5'])).toMatchObject({ grade: 'great', text: 'Scored 85.' })
  })

  it('Good: 10 or more above the average', () => {
    expect(grade(501, ['T20', 'S7', 'S3'])).toMatchObject({ tag: 'scoring', grade: 'good', text: 'Scored 70.', tip: false })
  })

  it('OK: from 5 below the average to 10 above', () => {
    expect(grade(501, ['S20', 'S20', 'S20'])).toMatchObject({ tag: 'scoring', grade: 'ok', text: 'Scored 60.', tip: false })
  })

  it('grades the rating, not the raw score, and says when the grouping lifted the grade', () => {
    const rated = (names: string[], rating: number, average = 60) => ({
      ...facts(501, names, { average }),
      grouping: { spreadMm: 6, edgeMm: 2, rating, comment: { level: 'great' as const, text: 'Great grouping' } },
    })
    // 60 is OK on a 60 average; rated 80 it is Good
    expect(classifyVisit(rated(['S20', 'S20', 'S20'], 80))).toMatchObject({
      tag: 'scoring',
      grade: 'good',
      text: 'Scored 60, great grouping (6 mm), close to the target (2 mm).',
      tip: false,
    })
    // 45 is Weak on a 70 average; rated 68 it is OK
    expect(classifyVisit(rated(['S20', 'S20', 'S5'], 68, 70))).toMatchObject({ grade: 'ok', text: expect.stringMatching(/^Scored 45, /) })
    // A rating that leaves the grade alone keeps the plain text
    expect(classifyVisit(rated(['S20', 'S20', 'S20'], 64))).toMatchObject({ tag: 'scoring', grade: 'ok', text: 'Scored 60.', tip: false })
  })

  it('a very low score is Weak at best: a tight group never lifts it higher', () => {
    expect(
      classifyVisit({ ...facts(501, ['S5', 'S5', 'S5']), grouping: { spreadMm: 2, edgeMm: 1, rating: 57, comment: null } }),
    ).toMatchObject({
      tag: 'scoring',
      grade: 'weak',
      text: 'Scored 15; your usual visit is 60.',
      value: { points: -3, rule: 'veryLow' },
    })
    expect(grade(501, ['S5', 'S5', 'S5'], { average: 30 })).toMatchObject({ grade: 'weak', value: { rule: 'veryLow' } })
  })

  it("the value: the rating's parts and its distance from the average", () => {
    const f = { ...facts(501, ['S20', 'S20', 'S20']), grouping: { spreadMm: 15, edgeMm: 20, rating: 0, comment: null } }
    // Half of each bonus's maximum (grouping.ts): 7.5 and 4; the rating is the facts'
    expect(classifyVisit(f).value).toEqual({
      points: -60,
      rule: null,
      scoring: { scored: 60, grouping: 7.5, closeness: 4, rating: 0, average: 60 },
      terms: [],
      band: 'bad',
      bands: SCORING_SCALE,
      fewestChance: null,
    })
    expect(grade(501, ['T20', 'T19', 'T19']).value).toMatchObject({ rule: 'brilliant', points: 114 })
  })

  it('Bad: a strategy note on a later dart, told from the note', () => {
    // From 177 the third dart is thrown on 57
    expect(grade(177, ['T20', 'T20', 'S20'])).toMatchObject({
      tag: 'scoring',
      grade: 'bad',
      text: 'On 57, S20: better S17 — S20 leaves 37, with no one-dart finish.',
      tip: false,
    })
  })

  it('a tip does not make it Bad, and speaks for the visit', () => {
    const f = facts(177, ['T20', 'T20', 'S20'])
    expect(f.notes).toHaveLength(1)
    expect(classifyVisit({ ...f, notes: f.notes.map(n => ({ ...n, tip: true })) })).toMatchObject({
      tag: 'scoring',
      grade: 'excellent',
      text: 'Tip: On 57, S20: better S17 — S20 leaves 37, with no one-dart finish.',
      tip: true,
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
  const points = (f: VisitFacts) =>
    f.deltas.reduce((s, d, i) => s + dartGrade(d, closeness(f.classes[i]), f.throws[i].bust ? bustPenalty(f.throws[i].dart) : 0), 0)

  it("marks a tip's text as a tip, and only that", () => {
    const f = facts(47, ['S1', 'S15', 'S20'])
    expect(f.notes.length).toBeGreaterThan(0)
    const r = classifyVisit({ ...f, notes: f.notes.map(n => ({ ...n, tip: true })) })
    expect(r).toMatchObject({ tag: 'setup', tip: true, grade: classifyVisit({ ...f, notes: [] }).grade })
    expect(r.text).toMatch(/^Tip: /)
    expect(classifyVisit(f).tip).toBe(false)
  })

  it('Bad: a strategy note, told from the note', () => {
    expect(grade(97, ['S20', 'S20', 'S20'])).toMatchObject({
      tag: 'setup',
      grade: 'bad',
      text: 'On 57, S20: better S17 — S20 leaves 37, with no one-dart finish.',
      tip: false,
    })
  })

  it('a bust is graded by its value: it goes back to the start', () => {
    expect(grade(7, ['S20'])).toMatchObject({ tag: 'setup', grade: 'bad' })
    expect(classifyVisit({ ...facts(7, ['S20']), notes: [] }).text).toBe('Busted on the first dart (S20 on 7).')
    expect(classifyVisit({ ...facts(2, ['S1']), notes: [] })).toMatchObject({
      tag: 'doubling',
      grade: 'bad',
      text: 'Busted on the first dart (S1 on 2).',
      tip: false,
    })
  })

  it('busting back to 32 beats leaving 2', () => {
    // From 32: S16, then a T8 at D8 busts back to 32; S16, S8, S6 leaves D1 (notes left out)
    const bust = { ...facts(32, ['S16', 'T8']), notes: [] }
    const two = { ...facts(32, ['S16', 'S8', 'S6']), notes: [] }
    expect(two.then).toBe(2)
    expect(points(bust)).toBeGreaterThan(points(two))
    expect(classifyVisit(bust)).toMatchObject({
      tag: 'doubling',
      grade: 'bad',
      text: 'Busted on the second dart (T8 on 16), after one miss inside D16. Back on 32.',
      tip: false,
    })
    expect(classifyVisit(two)).toMatchObject({ grade: 'bad' })
  })

  it('a bust costs BUST_DART_LOST for each dart it kept from being thrown', () => {
    // On 8 (D4), the opponent nowhere near: the earlier the bust, the more it costs
    const on8 = (names: string[]) => classifyVisit({ ...facts(8, names), notes: [] })
    const first = on8(['S10'])
    const second = on8(['Miss', 'S10'])
    const third = on8(['Miss', 'Miss', 'S10'])
    const missed = on8(['Miss', 'Miss', 'Miss'])
    expect(second.value.points - first.value.points).toBeCloseTo(BUST_DART_LOST)
    expect(third.value.points - second.value.points).toBeCloseTo(BUST_DART_LOST)
    // The third dart's bust loses no dart: it ends where three misses do
    expect(third.value.points).toBeCloseTo(missed.value.points)
    expect([first, second, third, missed].map(v => [Math.round(v.value.points), v.grade])).toEqual([
      [-29, 'bad'],
      [-24, 'bad'],
      [-19, 'weak'],
      [-19, 'weak'],
    ])
    expect(first.text).toBe('Busted on the first dart (S10 on 8).')
  })

  it('a Bust-back is told as one, graded by its value', () => {
    expect(classifyVisit({ ...bustBack(facts(7, ['S20'])), notes: [] })).toMatchObject({
      text: 'Busted on purpose with the first dart to stay on 7.',
    })
    // On 20: S10 at D10, then S7 (a tip: better D5) leaves 3, and S5 busts back to 20
    const f = facts(20, ['S10', 'S7', 'S5'])
    expect(f.classes.map(c => c.kind)).toEqual(['double', 'route', 'bustBack'])
    expect(f.notes.map(n => n.tip)).toEqual([true])
    expect(points(f)).toBeLessThan(OK_FROM)
    expect(classifyVisit(f)).toMatchObject({
      tag: 'doubling',
      grade: 'weak',
      text: 'Busted on purpose with the third dart to stay on 20 (D10).',
      tip: false,
    })
    // The same darts, the last a plain bust: the same value
    expect(classifyVisit({ ...f, classes: [...f.classes.slice(0, 2), { ...f.classes[2], kind: 'bust' }] })).toMatchObject({
      tag: 'doubling',
      grade: 'weak',
      text: 'Busted on the third dart (S5 on 3), after one miss inside D10, the second was S7. Back on 20.',
      tip: false,
    })
    expect(classifyVisit({ ...bustBack(facts(50, ['S25', 'S20', 'S10'])), notes: [] })).toMatchObject({
      text: 'Busted on purpose with the third dart to stay on 50 (the bull).',
    })
  })

  it('Bad: a strategy note that is not a tip', () => {
    // 24 left: S14 instead of the direct D12, with the opponent on 32
    const r = grade(24, ['S14', 'Miss', 'Miss'], { opponentLeft: 32 })
    expect(r).toMatchObject({ tag: 'doubling', grade: 'bad' })
    expect(r.text).toMatch(/^On 24, S14: better D12/)
    expect(r.tip).toBe(false)
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
    expect(classifyVisit(f)).toMatchObject({
      tag: 'setup',
      grade: 'bad',
      text: 'S19 on 56 cost 15% checkout chance: 37 left is a single to double (S5 · D16).',
      tip: false,
    })
  })

  it('121 → S20, T17, S18: a good setup to D16', () => {
    const f = facts(121, ['S20', 'T17', 'S18'])
    expect(points(f)).toBeGreaterThanOrEqual(GOOD_FROM)
    expect(classifyVisit(f).value).toEqual({
      points: points(f),
      scoring: null,
      terms: f.deltas.map((delta, i) => ({ delta, closeness: closeness(f.classes[i]), penalty: 0 })),
      band: 'good',
      bands: FINISH_SCALE,
      rule: null,
      fewestChance: null,
    })
    expect(classifyVisit(f)).toMatchObject({
      tag: 'doubling',
      grade: 'good',
      text: 'The third split to D16. 32 left is a one-dart finish (D16).',
      tip: false,
    })
  })

  it('a checkout is told by its double', () => {
    expect(grade(32, ['S16', 'D8'])).toMatchObject({ tag: 'doubling', grade: 'good', text: 'Checked out on D8.', tip: false })
    expect(grade(76, ['S20', 'S16', 'D20'])).toMatchObject({ tag: 'doubling', grade: 'good', text: 'Checked out on D20.', tip: false })
    expect(grade(50, ['Miss', 'Bull'])).toMatchObject({ text: 'Checked out on the bull.' })
  })

  it('a flat or better visit says what it left, a worse one leads with its costliest dart', () => {
    expect(grade(170, ['T20', 'T20', 'S25'])).toMatchObject({
      tag: 'doubling',
      grade: 'good',
      text: '1 dart at the bull, in the 25. 25 left is a single to double (S9 · D8).',
      tip: false,
    })
    expect(grade(150, ['S20', 'S20', 'S20'])).toMatchObject({
      tag: 'setup',
      grade: 'weak',
      text: 'S20 on 110 cost 6% checkout chance: 90 left is a treble to double (T20 · D15).',
      tip: false,
    })
    expect(classifyVisit({ ...facts(170, ['S1', 'Miss', 'Miss']), notes: [] }).text).toMatch(/: 169 left: no checkout in three darts\.$/)
  })

  it('three darts missed at the double: Weak', () => {
    expect(grade(32, ['Miss', 'Miss', 'Miss'])).toMatchObject({
      tag: 'doubling',
      grade: 'weak',
      text: '3 darts at D16, all outside. Still on 32.',
      tip: false,
    })
  })

  it('a Doubling visit without a checkout says what happened to the double, then where you stand', () => {
    // Placed on number `n`'s centre line, `mm` outside its double
    const at = (n: number, mm: number): CoachDart => {
      const r = (170 + mm) / 170
      const p = { x: r * Math.cos(segAngle(SEGS.indexOf(n))), y: r * Math.sin(segAngle(SEGS.indexOf(n))) }
      const { name, number, multiplier } = segmentAt(p.x, p.y)
      return { segment: { name, number, multiplier }, coords: p }
    }
    // Off the board: they score nothing
    const placed = (start: number, darts: CoachDart[]) =>
      classifyVisit({ ...facts(start, [], { visit: { seat: 0, darts, scored: 0, remaining: start, bust: false } }), notes: [] }).text
    expect(placed(8, [at(4, 4), at(4, 5), at(4, 6)])).toBe('3 darts at D4, all just outside (5 mm on average). Still on 8.')
    expect(placed(8, [at(4, 12)])).toBe('1 dart at D4, outside (12 mm). Still on 8.')
    // Typed darts: no mm
    const typed = (start: number, names: string[]) => classifyVisit({ ...facts(start, names), notes: [] }).text
    expect(typed(32, ['S16', 'S8', 'S4'])).toBe(
      '1 dart at D16, inside, 1 dart at D8, inside, 1 dart at D4, inside. 4 left is a one-dart finish (D2).',
    )
    expect(typed(32, ['Miss', 'S16', 'S8'])).toBe(
      '2 darts at D16 missed (one outside, one inside), 1 dart at D8, inside. 8 left is a one-dart finish (D4).',
    )
    expect(typed(8, ['Miss', 'S10'])).toBe('Busted on the second dart (S10 on 8), after one miss outside D4. Back on 8.')
    expect(typed(8, ['S4', 'S5'])).toBe('Busted on the second dart (S5 on 4), after one miss inside D4. Back on 8.')
    expect(typed(50, ['25', '25'])).toBe('Busted on the second dart (25 on 25), after one miss in the 25. Back on 50.')
    expect(typed(20, ['S20', 'Miss'])).toBe('Busted on the first dart (S20 on 20).')
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
    expect(classifyVisit(near).grade).toBe('inaccuracy')
    expect(classifyVisit(far).grade).toBe('weak')
  })

  it('the match dart: a dart at the double on the last visit of a lost leg', () => {
    expect(grade(52, ['S12', 'Miss'], { lost: true }).text).toMatch(/^Missed the match dart\. /)
    expect(classifyVisit({ ...facts(40, ['S20', 'S20'], { lost: true }), notes: [] })).toMatchObject({
      tag: 'doubling',
      grade: 'bad',
      text: 'Missed the match dart. Busted on the second dart (S20 on 20), after one miss inside D20. Back on 40.',
      tip: false,
    })
    // Never on a setup: no dart went at a double
    expect(grade(150, ['S20', 'S20', 'S20'], { lost: true }).text).not.toMatch(/match dart/)
    // Nor in the 25 on 40: the bull is the double on 50 only, so the note's better D20 stands alone
    const in25 = { seat: 0, darts: [{ segment: seg('25'), coords: { x: 0, y: 0.06 } }], scored: 25, remaining: 15, bust: false }
    expect(classifyVisit(facts(40, [], { lost: true, visit: in25 })).text).toBe('Tip: On 40, 25: better D20.')
  })
})

describe('Brilliant: the fewest-darts finish when it was hard, else Excellent at least', () => {
  const fewest = (start: number, names: string[]) => grade(start, names).value.fewestChance !== null

  it('scoring visits that leave a finish in the fewest darts', () => {
    expect(grade(501, ['T20', 'T19', 'T19'])).toMatchObject({
      tag: 'scoring',
      grade: 'brilliant',
      text: 'Nine-darter still on.',
      tip: false,
    })
    expect(grade(501, ['T20', 'T20', 'T17']).text).toBe('Nine-darter still on.')
    expect(fewest(501, ['T20', 'T20', 'T20'])).toBe(true)
    // 361 needs 7
    expect(fewest(501, ['T20', 'T20', 'S20'])).toBe(false)
    expect(grade(211, ['T20', 'T20', 'T17'])).toMatchObject({
      tag: 'scoring',
      grade: 'brilliant',
      text: 'Scored 171: 40 left is still a one-dart finish (D20), the fewest possible.',
      tip: false,
    })
    expect(fewest(211, ['T20', 'T19', 'T20'])).toBe(true)
    // 31 is a 2-dart finish: 5 darts from 211, not 4
    expect(fewest(211, ['T20', 'T20', 'T20'])).toBe(false)
  })

  it('501 → 180 and 501 → 171 are Brilliant: level 13 keeps a nine-darter on in about 4% of visits', () => {
    for (const names of [
      ['T20', 'T20', 'T20'],
      ['T20', 'T19', 'T19'],
    ]) {
      const g = grade(501, names)
      expect(g).toMatchObject({ grade: 'brilliant', value: { rule: 'brilliant' } })
      expect(g.value.fewestChance).toBeCloseTo(3.8, 1)
    }
  })

  it('the nine-darter line only on the seat first visit', () => {
    expect(classifyVisit({ ...facts(501, ['T20', 'T20', 'T20']), first: false }).text).toBe(
      'Scored 180: 321 left is still 6 darts from a checkout, the fewest possible.',
    )
  })

  it('checkouts in the fewest darts: Brilliant from a hard finish, Excellent from an easy one', () => {
    // 120 → D20 D20 D20: 16.5% at level 13 to check out 120 in three darts
    const d120 = grade(120, ['D20', 'D20', 'D20'])
    expect(d120).toMatchObject({ grade: 'brilliant', text: 'Checked out in the fewest darts (D20).', value: { rule: 'brilliant' } })
    expect(d120.value.fewestChance).toBeCloseTo(16.5, 1)
    // 100 → T20 D20: 11.5%
    const t100 = grade(100, ['T20', 'D20'])
    expect(t100).toMatchObject({ grade: 'brilliant', text: 'Checked out in the fewest darts (D20).' })
    expect(t100.value.fewestChance).toBeCloseTo(11.5, 1)
    expect(grade(170, ['T20', 'T20', 'Bull'])).toMatchObject({ grade: 'brilliant', text: 'Checked out in the fewest darts (the bull).' })
    // 40 → D20: 36.2%, above BRILLIANT_CHANCE: the Excellent floor
    const d40 = grade(40, ['D20'])
    expect(d40.value.fewestChance! / 100).toBeGreaterThan(BRILLIANT_CHANCE)
    expect(d40).toMatchObject({ tag: 'doubling', grade: 'excellent', text: 'Checked out in the fewest darts (D20).', tip: false })
    expect(d40.value.rule).toBe(bandOf(d40.value.points, FINISH_BANDS) === 'excellent' ? null : 'fewest')
  })

  it('a visit off the fewest darts keeps its value grade', () => {
    for (const names of [
      ['S20', 'S10', 'D5'],
      ['S20', 'D10'],
    ]) {
      const g = grade(40, names)
      expect(g.grade, names.join(' ')).toBe(bandOf(g.value.points, FINISH_BANDS))
      expect(g.value).toMatchObject({ rule: null, fewestChance: null })
    }
  })

  it('a setup visit can keep the fewest darts', () => {
    expect(fewest(169, ['T20', 'T19', 'S12'])).toBe(true)
    expect(grade(169, ['T20', 'T19', 'S12']).tag).toBe('setup')
  })

  it('never on a bust; a strategy note wins, a tip does not', () => {
    expect(fewest(40, ['T20'])).toBe(false)
    // 98 → T20 D19: the fewest; a forced note keeps it Bad, a tip leaves it Brilliant
    const f = facts(98, ['T20', 'D19'])
    expect(classifyVisit(f).grade).toBe('brilliant')
    const note = { ...explainedNote(facts(24, ['S14', 'D5']).notes)!, tip: false }
    expect(classifyVisit({ ...f, notes: [note] }).grade).toBe('bad')
    expect(classifyVisit({ ...f, notes: [{ ...note, tip: true as const }] }).grade).toBe('brilliant')
  })

  it("sends each dart's terms: a bust's penalty for the darts it kept from being thrown", () => {
    const { value } = classifyVisit({ ...facts(40, ['S20', 'S20']), notes: [] })
    expect(value.terms.map(t => t.penalty)).toEqual([0, BUST_DART_LOST])
    expect(value.points).toBeCloseTo(value.terms.reduce((s, t) => s + dartGrade(t.delta, t.closeness, t.penalty), 0))
    expect(value).toMatchObject({ band: 'bad', rule: null })
  })

  it('records an override only when it moved the band: a note on a visit already Bad', () => {
    const note = { ...explainedNote(facts(24, ['S14', 'D5']).notes)!, tip: false }
    const busted = classifyVisit({ ...facts(40, ['S20', 'S20']), notes: [note] })
    expect(busted).toMatchObject({ grade: 'bad', value: { rule: null } })
    expect(classifyVisit({ ...facts(98, ['T20', 'D19']), notes: [note] }).value.rule).toBe('note')
  })
})
