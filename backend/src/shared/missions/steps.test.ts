import { describe, expect, it } from 'vitest'
import { dartOn, finishes, hits, initAttempt, marksOf, type Outcome, progressOf, visitEndOn } from './steps.js'
import { StepSchema, type Step } from './types.js'
import { dart } from '../../test/missionDarts.js'

/** Plays `labels` (a `|` ends the visit) at one attempt; the outcome of each input in order. */
function play(step: Step, labels: string): { outcomes: Outcome[]; progress: ReturnType<typeof progressOf> } {
  let run = initAttempt(step)
  const outcomes: Outcome[] = []
  for (const l of labels.split(' ').filter(Boolean)) {
    const r = l === '|' ? visitEndOn(step, run) : dartOn(step, run, dart(l))
    run = r.run
    outcomes.push(r.outcome)
  }
  return { outcomes, progress: progressOf(step, run) }
}

const step = (s: unknown): Step => StepSchema.parse(s)
const hitStep = (o: Partial<Extract<Step, { type: 'hit' }>>) =>
  step({ type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any', ...o })

describe('targets and marks', () => {
  it('reads a target by its ring', () => {
    expect(hits('20', dart('T20'))).toBe(true)
    expect(hits('S20', dart('S20'))).toBe(true)
    expect(hits('S20', dart('D20'))).toBe(false)
    expect(hits('T20', dart('T20'))).toBe(true)
    expect(hits('B', dart('B'))).toBe(true)
    expect(hits('B', dart('DB'))).toBe(true)
    expect(hits('DB', dart('B'))).toBe(false)
    expect(hits('20', dart('M'))).toBe(false)
  })

  it('counts a double as 2 marks, a treble as 3, the bulls as 1 and 2 on 25', () => {
    expect(marksOf(dart('D20'))).toEqual({ target: 20, marks: 2 })
    expect(marksOf(dart('T19'))).toEqual({ target: 19, marks: 3 })
    expect(marksOf(dart('B'))).toEqual({ target: 25, marks: 1 })
    expect(marksOf(dart('DB'))).toEqual({ target: 25, marks: 2 })
    expect(marksOf(dart('M'))).toBeNull()
  })

  it('finishes on a double (the inner bull too), master on a treble as well', () => {
    expect(finishes(dart('D20'), 'double')).toBe(true)
    expect(finishes(dart('DB'), 'double')).toBe(true)
    expect(finishes(dart('T20'), 'double')).toBe(false)
    expect(finishes(dart('T20'), 'master')).toBe(true)
    expect(finishes(dart('S1'), 'single')).toBe(true)
  })
})

describe('hit targets', () => {
  it('in a row: a dart that misses the target fails the attempt', () => {
    const s = hitStep({ hits: 3, inARow: true })
    expect(play(s, 'S20 S20 S1').outcomes).toEqual(['go', 'go', 'fail'])
    expect(play(s, 'S20 S20 S20').outcomes.at(-1)).toBe('done')
  })

  it('any: a miss in between changes nothing', () => {
    const s = hitStep({ hits: 2 })
    const r = play(s, 'S20 M S1 S20')
    expect(r.outcomes).toEqual(['go', 'go', 'go', 'done'])
  })

  it('in this order: only the next target counts, a wrong dart does not reset', () => {
    const s = hitStep({ targets: ['D11', 'B', 'D6'], order: 'in_order', within: 9 })
    const r = play(s, 'B D11 D6 DB D6')
    expect(r.outcomes).toEqual(['go', 'go', 'go', 'go', 'done'])
  })

  it('any order: each target needs its own hits', () => {
    const s = hitStep({ targets: ['S20', 'D20', 'T20'], within: 'visit' })
    expect(play(s, 'T20 S20 D20').outcomes.at(-1)).toBe('done')
    expect(play(s, 'T20 T20 S20').progress).toEqual({ value: 2, of: 3 })
  })

  it('within N darts: fails once the darts are used up', () => {
    const s = hitStep({ hits: 2, within: 3 })
    expect(play(s, 'S20 M M').outcomes).toEqual(['go', 'go', 'fail'])
    expect(play(s, 'S20 M S20').outcomes.at(-1)).toBe('done')
  })

  it('one visit: the visit ending before the targets are hit fails', () => {
    const s = hitStep({ targets: ['S20', 'D20'], within: 'visit' })
    expect(play(s, 'S20 M M |').outcomes.at(-1)).toBe('fail')
  })

  it('refuses a window shorter than the hits it needs', () => {
    expect(StepSchema.safeParse({ type: 'hit', targets: ['S20'], hits: 4, inARow: false, order: 'any', within: 'visit' }).success).toBe(
      false,
    )
    expect(StepSchema.safeParse({ type: 'hit', targets: ['X20'], hits: 1, inARow: false, order: 'any' }).success).toBe(false)
  })
})

describe('marks', () => {
  const s = (o: object) => step({ type: 'marks', targets: [20], marks: 5, per: 'total', within: 4, ...o })

  it('counts doubles and trebles within the darts', () => {
    expect(play(s({}), 'T20 D20').outcomes).toEqual(['go', 'done'])
    expect(play(s({}), 'S20 S20 S20 S1').outcomes).toEqual(['go', 'go', 'go', 'fail'])
  })

  it('each: every target needs its marks; the bulls mark 25', () => {
    const close = s({ targets: [19, 25], marks: 3, per: 'each' })
    const r = play(close, 'T19 B DB')
    expect(r.outcomes).toEqual(['go', 'go', 'done'])
  })

  it('total: marks add up across the targets', () => {
    expect(play(s({ targets: [19, 20], marks: 4 }), 'D19 D20').outcomes).toEqual(['go', 'done'])
  })

  it('refuses a target twice', () => {
    expect(StepSchema.safeParse({ type: 'marks', targets: [20, 20], marks: 3, per: 'each' }).success).toBe(false)
  })
})

describe('visits', () => {
  const s = (o: object) => step({ type: 'visits', compare: 'at_least', points: 41, visits: 2, inARow: true, ...o })

  it('in a row: a visit below the bar fails the attempt', () => {
    expect(play(s({}), 'T20 | S1 S1 S1 |').outcomes).toEqual(['go', 'go', 'go', 'go', 'go', 'fail'])
    expect(play(s({}), 'T20 | T19 |').outcomes.at(-1)).toBe('done')
  })

  it('any: a low visit does not count, the next good one does', () => {
    expect(play(s({ inARow: false }), 'T20 | S1 | T19 |').outcomes).toEqual(['go', 'go', 'go', 'go', 'go', 'done'])
  })

  it('at most, exactly and never', () => {
    expect(play(s({ compare: 'at_most', points: 26, visits: 1 }), 'S20 S6 |').outcomes.at(-1)).toBe('done')
    expect(play(s({ compare: 'exactly', points: 26, visits: 1 }), 'S20 S5 |').outcomes.at(-1)).toBe('fail')
    expect(play(s({ compare: 'not', points: 26, visits: 1 }), 'S20 S5 S1 S1 |').outcomes.at(-1)).toBe('done')
  })
})

describe('score', () => {
  it('needs the points within the darts', () => {
    const s = step({ type: 'score', points: 100, within: 3 })
    expect(play(s, 'T20 D20').outcomes).toEqual(['go', 'done'])
    expect(play(s, 'T20 S20 S19').outcomes.at(-1)).toBe('fail')
    expect(StepSchema.safeParse({ type: 'score', points: 181, within: 3 }).success).toBe(false)
  })
})

describe('average', () => {
  it('judges the 3-dart average once the visits are in', () => {
    const s = step({ type: 'average', average: 60, visits: 2 })
    const r = play(s, 'T20 S20 M | S20 S20 S20 |')
    expect(r.outcomes.at(-1)).toBe('done')
    expect(r.progress.average).toBe(70)
    expect(play(s, 'S20 S20 S1 | S20 S1 S1 |').outcomes.at(-1)).toBe('fail')
  })
})

describe('checkout', () => {
  const s = step({ type: 'checkout', start: 40, maxDarts: 3, finish: 'double' })

  it('checks out on a double', () => {
    expect(play(s, 'S20 D10').outcomes).toEqual(['go', 'done'])
  })

  it('a bust fails the attempt: below 0, 1 left or 0 not on a double', () => {
    expect(play(s, 'T20').outcomes).toEqual(['fail'])
    expect(play(s, 'S39').outcomes).toEqual(['fail'])
    expect(play(s, 'S20 S20').outcomes).toEqual(['go', 'fail'])
  })

  it('fails when the darts run out', () => {
    expect(play(s, 'S1 S1 S1').outcomes).toEqual(['go', 'go', 'fail'])
  })

  it('master out finishes on a treble', () => {
    const m = step({ type: 'checkout', start: 60, maxDarts: 3, finish: 'master' })
    expect(play(m, 'T20').outcomes).toEqual(['done'])
  })
})

describe('fast leg', () => {
  const s = step({ type: 'leg', start: 301, within: 12, finish: 'double' })

  it('a bust ends the visit and goes back to the score the visit started with', () => {
    const r = play(s, 'T20 T20 T20 | T20 T20')
    expect(r.outcomes).toEqual(['go', 'go', 'go', 'go', 'go', 'visit_over'])
    expect(r.progress.left).toBe(121)
  })

  it('wins within the darts, fails past them', () => {
    expect(play(s, 'T20 T20 T20 | T20 S1 D20 | D10').outcomes.at(-1)).toBe('done')
    expect(play(step({ type: 'leg', start: 301, within: 6, finish: 'double' }), 'T20 T20 T20 | T20 S1 S20').outcomes.at(-1)).toBe('fail')
  })

  it('refuses a dart count nobody can win in', () => {
    expect(StepSchema.safeParse({ type: 'leg', start: 501, within: 8, finish: 'double' }).success).toBe(false)
  })
})
