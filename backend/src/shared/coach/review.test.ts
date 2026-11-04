import { describe, it, expect } from 'vitest'
import { coachLevel, loadModel } from './model.js'
import { reviewLeg, scoringLetter, type LegReview } from './review.js'
import { dart, leg, visit, REF, REFS } from './testLegs.js'
import { coachDart, type CoachLeg, type CoachVisit } from './walk.js'
import { NOT_COUNTED, type DartClass, type DartKind } from './dartClass.js'

const names = ['Admin', 'Gerwyn']
/** A dart class pinned by its kind (dartClass.test.ts pins the rest) */
const kind = (k: DartKind): DartClass => expect.objectContaining({ kind: k })
const ctx = (startScore: number, average: number | null = null) => ({
  startScore,
  average,
  models: REFS,
  opponentName: (s: number) => names[s],
})

/** Seat 0 wins a 501 leg in 17 darts against a seat 1 that scores 3 a visit. */
function wonLeg(): CoachLeg {
  const s0 = [
    ['T20', 'T20', 'S20'],
    ['S20', 'S1', 'S5'],
    ['T20', 'S20', 'S20'],
    ['T20', 'T19', 'S20'],
    // On 47 with two darts, S1 (S20 leaves 27, no one-dart finish) instead of S15
    ['T17', 'S1', 'S6'],
    ['S20', 'D10'],
  ]
  const visits: CoachVisit[] = []
  let left = [501, 501]
  for (const [i, names0] of s0.entries()) {
    const v = visit(0, left[0], names0)
    visits.push(v)
    left = [v.remaining, left[1]]
    if (i === s0.length - 1) break
    const o = visit(1, left[1], ['S1', 'S1', 'S1'])
    visits.push(o)
    left = [left[0], o.remaining]
  }
  // The camera placed the first dart
  const first = visits[0]
  visits[0] = { ...first, darts: [dart('T20', { x: 0, y: 0.6 }), ...first.darts.slice(1)] }
  return { ...leg(visits), winner: 0 }
}

describe('reviewLeg', () => {
  it('grades every visit, the three skills, the take and the counts', () => {
    const expected: LegReview = {
      coachLevel: 7,
      leg: 0,
      seat: 0,
      won: true,
      darts: 17,
      // 501 in 17 darts
      average: (501 / 17) * 3,
      visits: [
        {
          n: 1,
          left: 501,
          darts: [
            {
              name: 'T20',
              bedAimId: 'T20',
              coords: { x: 0, y: 0.6 },
              left: 441,
              bust: false,
              class: kind('scoringHit'),
              delta: null,
              closeness: null,
            },
            { name: 'T20', bedAimId: 'T20', coords: null, left: 381, bust: false, class: kind('scoringHit'), delta: null, closeness: null },
            {
              name: 'S20',
              bedAimId: 'SO20',
              coords: null,
              left: 361,
              bust: false,
              class: kind('scoringSingle'),
              delta: null,
              closeness: null,
            },
          ],
          scored: 140,
          then: 361,
          bust: false,
          tag: 'scoring',
          grade: 'excellent',
          text: 'Two trebles.',
          tip: false,
          notes: [],
          explained: null,
          grouping: null,
          value: {
            startChance: null,
            fewestChance: null,
            points: expect.closeTo(51.6, 1),
            rule: null,
            scoring: { scored: 140, grouping: 0, closeness: 0, rating: 140, average: (501 / 17) * 3 },
            terms: [],
            band: 'excellent',
            bands: expect.any(Array),
          },
        },
        {
          n: 2,
          left: 361,
          darts: [
            {
              name: 'S20',
              bedAimId: 'SO20',
              coords: null,
              left: 341,
              bust: false,
              class: kind('scoringSingle'),
              delta: null,
              closeness: null,
            },
            { name: 'S1', bedAimId: 'SO1', coords: null, left: 340, bust: false, class: kind('scoringMiss'), delta: null, closeness: null },
            { name: 'S5', bedAimId: 'SO5', coords: null, left: 335, bust: false, class: kind('scoringMiss'), delta: null, closeness: null },
          ],
          scored: 26,
          then: 335,
          bust: false,
          tag: 'scoring',
          grade: 'bad',
          text: 'Scored 26; your usual visit is 88.',
          tip: false,
          notes: [],
          explained: null,
          grouping: null,
          value: expect.objectContaining({ points: expect.closeTo(-62.4, 1), rule: null }),
        },
        {
          n: 3,
          left: 335,
          darts: [
            { name: 'T20', bedAimId: 'T20', coords: null, left: 275, bust: false, class: kind('scoringHit'), delta: null, closeness: null },
            {
              name: 'S20',
              bedAimId: 'SO20',
              coords: null,
              left: 255,
              bust: false,
              class: kind('scoringSingle'),
              delta: null,
              closeness: null,
            },
            {
              name: 'S20',
              bedAimId: 'SO20',
              coords: null,
              left: 235,
              bust: false,
              class: kind('scoringSingle'),
              delta: null,
              closeness: null,
            },
          ],
          scored: 100,
          then: 235,
          bust: false,
          tag: 'scoring',
          grade: 'good',
          text: 'Scored 100.',
          tip: false,
          notes: [],
          explained: null,
          grouping: null,
          value: expect.objectContaining({ points: expect.closeTo(11.6, 1), rule: null }),
        },
        {
          n: 4,
          left: 235,
          darts: [
            { name: 'T20', bedAimId: 'T20', coords: null, left: 175, bust: false, class: kind('scoringHit'), delta: null, closeness: null },
            { name: 'T19', bedAimId: 'T19', coords: null, left: 118, bust: false, class: kind('scoringHit'), delta: null, closeness: null },
            { name: 'S20', bedAimId: 'SO20', coords: null, left: 98, bust: false, class: kind('route'), delta: null, closeness: null },
          ],
          scored: 137,
          then: 98,
          bust: false,
          tag: 'scoring',
          // 235 is a 5-dart finish, 98 a 2-dart one: level 7 keeps that path 25% of the time, just
          // too often for Brilliant
          grade: 'excellent',
          text: 'Scored 137: 98 left is still a treble to double (T20 · D19), the fewest possible.',
          tip: false,
          notes: [],
          explained: null,
          grouping: null,
          value: expect.objectContaining({ rule: 'fewest', fewestChance: expect.closeTo(25.2, 1) }),
        },
        {
          n: 5,
          left: 98,
          darts: [
            {
              name: 'T17',
              bedAimId: 'T17',
              coords: null,
              left: 47,
              bust: false,
              class: kind('route'),
              delta: expect.any(Number),
              closeness: null,
            },
            {
              name: 'S1',
              bedAimId: 'SO1',
              coords: null,
              left: 46,
              bust: false,
              class: kind('route'),
              delta: expect.any(Number),
              closeness: null,
            },
            {
              name: 'S6',
              bedAimId: 'SO6',
              coords: null,
              left: 40,
              bust: false,
              class: kind('route'),
              delta: expect.any(Number),
              closeness: null,
            },
          ],
          scored: 58,
          then: 40,
          bust: false,
          tag: 'setup',
          grade: 'bad',
          text: "On 47, S1: better S15 — S1 leaves 46, which one dart can't finish.",
          tip: false,
          notes: [expect.objectContaining({ leg: 0, visit: 8, dart: 1, left: 47, thrown: 'S1', better: 'S15', tip: false })],
          explained: expect.objectContaining({ visit: 8, dart: 1, better: 'S15' }),
          grouping: null,
          value: {
            startChance: expect.any(Number),
            points: expect.closeTo(-2.1, 1),
            rule: 'note',
            scoring: null,
            terms: expect.any(Array),
            band: 'inaccuracy',
            bands: expect.any(Array),
            fewestChance: null,
          },
        },
        {
          n: 6,
          left: 40,
          darts: [
            {
              name: 'S20',
              bedAimId: 'SO20',
              coords: null,
              left: 20,
              bust: false,
              class: kind('double'),
              delta: expect.any(Number),
              closeness: null,
            },
            {
              name: 'D10',
              bedAimId: 'D10',
              coords: null,
              left: 0,
              bust: false,
              class: kind('double'),
              delta: expect.any(Number),
              closeness: null,
            },
          ],
          scored: 40,
          then: 0,
          bust: false,
          tag: 'doubling',
          grade: 'good',
          text: 'Checked out on D10.',
          tip: false,
          notes: [],
          explained: null,
          grouping: null,
          value: {
            startChance: expect.any(Number),
            points: expect.closeTo(9.1, 1),
            rule: null,
            scoring: null,
            terms: expect.any(Array),
            band: 'good',
            bands: expect.any(Array),
            fewestChance: null,
          },
        },
      ],
      skills: {
        // 383 in 11 darts with more than 170 left, against the game's 88.4
        scoring: { grade: 'A', line: 'Leg average 104.5 · one low visit' },
        setup: { grade: 'D', line: '1 of 1 setup visit graded Bad' },
        doubling: { grade: 'A', line: '1 of 2 darts at a double' },
      },
      take: 'Won in 17 darts. 1 bad setup visit.',
      counts: { lowVisits: 1, badSetups: 1, missedDoubles: 1, clean: false },
      grouping: { spreadMm: null, edgeMm: null },
    }
    expect(reviewLeg([wonLeg()], 0, 0, ctx(501))).toEqual(expected)
  })

  it("a finish visit's start chance and its darts' changes add up to its end: the checkout's 100", () => {
    const last = reviewLeg([wonLeg()], 0, 0, ctx(501))!.visits.at(-1)!
    expect(last.then).toBe(0)
    expect(last.value.startChance! + last.darts.reduce((s, d) => s + d.delta!, 0)).toBeCloseTo(100, 9)
  })

  it('grades scoring against the 30-day average when there is one', () => {
    const r = reviewLeg([wonLeg()], 0, 0, ctx(501, 60))
    expect(r?.visits[1]).toMatchObject({ grade: 'bad', text: 'Scored 26; your usual visit is 60.' })
    expect(r?.skills.scoring).toEqual({ grade: 'A', line: 'Leg average 104.5 · one low visit' })
  })

  it('says the opponent checked out first', () => {
    const r = reviewLeg([wonLeg()], 0, 1, ctx(501))
    // Five visits of 3: on their own average, but very low, so Weak at best
    expect(r).toMatchObject({ won: false, darts: 15, take: 'Lost: Admin checked out first. 5 weak visits.' })
  })

  it('names the weak visits of a leg whose skills are fine', () => {
    let left = 501
    const visits = [
      ['T20', 'T20', 'T20'],
      // 41 on a 60 average: Weak
      ['S20', 'S20', 'S1'],
      ['T20', 'T20', 'T20'],
      ['T20', 'D20'],
    ].map(names0 => {
      const v = visit(0, left, names0)
      left = v.remaining
      return v
    })
    const r = reviewLeg([{ ...leg(visits), winner: 0 }], 0, 0, ctx(501, 60))
    expect(r?.skills.scoring.grade).toBe('A')
    expect(r?.take).toBe('Won in 11 darts. One weak visit.')
  })

  it('names bad visits and weak visits separately, bad ones first', () => {
    let left = 501
    // 180, 70 (Weak on a 90 average), 15 (Bad), 180, then S16 D20 from 56
    const visits = [
      ['T20', 'T20', 'T20'],
      ['S20', 'S20', 'T10'],
      ['S5', 'S5', 'S5'],
      ['T20', 'T20', 'T20'],
      ['S16', 'D20'],
    ].map(names0 => {
      const v = visit(0, left, names0)
      left = v.remaining
      return v
    })
    const r = reviewLeg([{ ...leg(visits), winner: 0 }], 0, 0, ctx(501, 90))
    expect(left).toBe(0)
    expect(r?.skills.scoring.grade).toBe('A')
    expect(r?.take).toBe('Won in 14 darts. One bad visit and one weak visit.')
  })

  it('lost on a finish, with "–" for a skill with nothing to judge', () => {
    const l: CoachLeg = {
      ...leg([
        visit(0, 301, ['T20', 'T20', 'T20']),
        visit(1, 301, ['T20', 'T20', 'T20']),
        visit(0, 121, ['T19', 'S20', 'S4']),
        visit(1, 121, ['T20', 'S11', 'Bull']),
      ]),
      winner: 1,
    }
    const r = reviewLeg([l], 0, 0, ctx(301))
    expect(r?.skills.doubling).toEqual({ grade: null, line: '–' })
    expect(r?.take).toBe('You were on a finish after 6 darts and still lost. A clean leg.')
    expect(r?.counts).toEqual({ lowVisits: 0, badSetups: 0, missedDoubles: 0, clean: true })
  })

  it('marks the dart that busted, not the last one, and leaves the darts after it at the start', () => {
    // 32 left: S16, T20 busts; the game keeps the D8 thrown after it
    const r = reviewLeg([leg([visit(0, 32, ['S16', 'T20', 'D8'])])], 0, 0, ctx(501))
    expect(r?.visits[0].darts.map(d => [d.name, d.left, d.bust, d.class.kind])).toEqual([
      ['S16', 16, false, 'double'],
      ['T20', 32, true, 'bust'],
      ['D8', 32, false, 'notCounted'],
    ])
    expect(r?.visits[0].darts[2].class).toEqual(NOT_COUNTED)
    // The busting dart has its value change, the one after it none
    expect(r?.visits[0].darts.map(d => d.delta === null)).toEqual([false, false, true])
  })

  it('tells a deliberate bust as one: on 20, S10 and S7 leave 3, and the third dart busts back to D10', () => {
    for (const third of ['S5', 'T20']) {
      const r = reviewLeg([leg([visit(0, 20, ['S10', 'S7', third])])], 0, 0, ctx(501))
      expect(r?.visits[0].darts.map(d => d.class.kind)).toEqual(['double', 'route', 'bustBack'])
      expect(r?.visits[0]).toMatchObject({
        tag: 'doubling',
        grade: 'weak',
        text: 'Busted on purpose with the third dart to stay on 20 (D10).',
        tip: false,
      })
    }
  })

  it('a bust from a bad spot stays Bad: on 40, S20 then S19 with D10 to throw at', () => {
    const r = reviewLeg([leg([visit(0, 40, ['S20', 'S19'])])], 0, 0, ctx(501))
    expect(r?.visits[0].darts.map(d => d.class.kind)).toEqual(['double', 'bust'])
    expect(r?.visits[0]).toMatchObject({ tag: 'doubling', grade: 'bad', text: 'On 20, S19: better D10 — S19 busts.' })
  })

  it('counts as bad setups only the setup visits the Setup line counts', () => {
    // On 24 with the opponent on 32: S14 is a real note (not a tip), but in a doubling visit
    const r = reviewLeg([leg([visit(1, 32, []), visit(0, 24, ['S14', 'S1', 'S1'])])], 0, 0, ctx(501))
    expect(r?.visits[0]).toMatchObject({ tag: 'doubling', tip: false })
    expect(r?.visits[0].notes.some(n => !n.tip)).toBe(true)
    expect(r?.skills.setup).toEqual({ grade: null, line: '–' })
    expect(r?.counts.badSetups).toBe(0)
  })

  it('counts a setup visit graded Bad by its value as a bad setup, with no note', () => {
    // 100: S20 then S1 and a miss give away the 2-dart finish
    const r = reviewLeg([leg([visit(0, 100, ['S20', 'S1', 'Miss'])])], 0, 0, ctx(100))
    expect(r?.visits[0]).toMatchObject({ tag: 'setup', grade: 'bad', notes: [] })
    expect(r?.counts.badSetups).toBe(1)
    expect(r?.skills.setup).toEqual({ grade: 'D', line: '1 of 1 setup visit graded Bad' })
  })

  it("marks a visit whose text is a tip's", () => {
    // Solo on 24: S14 instead of the direct D12 is a tip, then two misses at D5
    const r = reviewLeg([leg([visit(0, 24, ['S14', 'Miss', 'Miss'])])], 0, 0, ctx(24))
    expect(r?.visits[0]).toMatchObject({ tag: 'doubling', grade: 'bad', tip: true })
    expect(r?.visits[0].text).toMatch(/^Tip: /)
  })

  it('grades scoring A at +10, B within ±10, C down to −25, D below', () => {
    expect([10, 9.9, -10, -10.1, -25, -25.1].map(scoringLetter)).toEqual(['A', 'B', 'B', 'C', 'C', 'D'])
  })

  it('is null for a seat with no darts in the leg', () => {
    const l = leg([visit(0, 301, ['T20']), visit(1, 301, [])])
    expect(reviewLeg([l], 0, 1, ctx(301))).toBeNull()
    expect(reviewLeg([l], 3, 0, ctx(301))).toBeNull()
  })

  it('a long finish and a late-leg drop', () => {
    // 701: seven scoring visits that drop off after three, then ten darts from 170
    const s0 = [
      ['T20', 'T20', 'T20'],
      ['T20', 'T20', 'T20'],
      ['T20', 'T20', 'S20'],
      ['S20', 'S1', 'S1'],
      ['S1', 'S1', 'S1'],
      ['S1', 'S1', 'S1'],
      ['S1', 'S1', 'S1'],
      ['S20', 'S20', 'S20'],
      ['S20', 'S20', 'S20'],
      ['S20', 'S20', 'S6'],
      ['D2'],
    ]
    let left = 701
    const visits = s0.map(names0 => {
      const v = visit(0, left, names0)
      left = v.remaining
      return v
    })
    expect(left).toBe(0)
    const r = reviewLeg([{ ...leg(visits), winner: 0 }], 0, 0, ctx(701))
    expect(r?.take).toMatch(/ From your first finish to the checkout took 10 darts\. Your scoring dropped after visit 3\.$/)
  })

  it("a bounce-out at the board's centre is a miss without a position, not a dart at the bull", () => {
    // Board Manager's stored bounce-out (issue #458), on 20 with the third dart
    const stored = {
      polar: { r: 0, theta_deg: 0 },
      score: 0,
      coords: { x: 0, y: 0 },
      bouncer: true,
      segment: { bed: 'Outside', name: 'Miss', number: 0, multiplier: 0 },
    } as const
    const bounce = coachDart(stored)
    expect(bounce.coords).toBeNull()
    const v = visit(0, 60, ['S20', 'S20'])
    const r = reviewLeg([leg([{ ...v, darts: [...v.darts, bounce] }])], 0, 0, ctx(60))
    expect(r?.visits[0].darts[2]).toMatchObject({ coords: null, class: { kind: 'double', detail: 'outside', estimated: true } })
    expect(r?.visits[0].notes).toEqual([])
  })
})

describe('the coaching level', () => {
  /** One solo visit reviewed for a player with `average`, by the model one level above it */
  async function graded(average: number, start: number, names: string[]) {
    const model = await loadModel(coachLevel(average))
    const r = reviewLeg([leg([visit(0, start, names)])], 0, 0, {
      startScore: 501,
      average,
      models: { model, reference: REF.landing },
      opponentName: () => '',
    })!
    const v = r.visits[0]
    return { level: r.coachLevel, grade: v.grade, delta: v.darts.reduce((s, d) => s + (d.delta ?? 0), 0) }
  }

  it('stores the level it coached with', async () => {
    expect((await graded(40, 100, ['S20', 'S20', 'S20'])).level).toBe(3)
    expect((await graded(80, 100, ['S20', 'S20', 'S20'])).level).toBe(7)
  })

  it("is happy with a 40 average's 60 on 100, which the 81-average model calls a small loss", async () => {
    const low = await graded(40, 100, ['S20', 'S20', 'S20'])
    expect(low.delta).toBeCloseTo(9.3, 1)
    expect(low.grade).toBe('good')
    // Level 7 grades it as before the levels
    const ref = await graded(80, 100, ['S20', 'S20', 'S20'])
    expect(ref.delta).toBeCloseTo(-2.7, 1)
    expect(ref.grade).toBe('inaccuracy')
  })

  it('still calls a wasted 59 bad, and a good 121 setup good, at both ends', async () => {
    for (const average of [40, 80, 81]) expect((await graded(average, 59, ['Miss', 'S3', 'S19'])).grade).toBe('bad')
    for (const average of [40, 80]) expect(['good', 'great']).toContain((await graded(average, 121, ['S20', 'T17', 'S18'])).grade)
  })
})
