import { describe, it, expect } from 'vitest'
import { CHECKOUTS } from '../checkoutTable.js'
import { AIMS } from './aims.js'
import { NOTE_THRESHOLD } from './notes.js'
import { isTip, numberCost, strategyNotes } from './notes.js'
import { dart, leg, visit, REF } from './testLegs.js'

const { evaluator } = REF
import { nearBull, throwsOf, type Throw } from './walk.js'

const solo = (start: number, names: string[]) => strategyNotes(throwsOf([leg([visit(0, start, names)])], 0, 501, REF), REF)
const noteOn = (start: number, names: string[], dart: number) => solo(start, names).find(n => n.dart === dart)

const aimIndex = (id: string) => AIMS.findIndex(a => a.id === id)
const spot = (id: string) => ({ x: AIMS[aimIndex(id)].x, y: AIMS[aimIndex(id)].y })
const outer = (n: number) => spot(`SO${n}`)
const inner = (n: number) => spot(`SI${n}`)
const stubThrow = (over: Partial<Throw>): Throw => ({
  leg: 0,
  visit: 0,
  dart: 0,
  start: 0,
  left: 0,
  after: 0,
  darts: 3,
  d: dart('S1'),
  checkout: false,
  bust: false,
  w: 1,
  opponentOnOut: false,
  ...over,
})

describe('isTip', () => {
  it('is true when the better aim is the direct out and nobody is on an out (50 → Bull)', () => {
    expect(isTip(stubThrow({ left: 50 }), aimIndex('Bull'))).toBe(true)
  })

  it('is true when the better aim is the direct out (32 → D16)', () => {
    expect(isTip(stubThrow({ left: 32 }), aimIndex('D16'))).toBe(true)
  })

  it('is false when an opponent is on an out', () => {
    expect(isTip(stubThrow({ left: 50, opponentOnOut: true }), aimIndex('Bull'))).toBe(false)
  })

  it("is false when the better aim isn't the direct out (49 → S9, 23 → S7)", () => {
    expect(isTip(stubThrow({ left: 49 }), aimIndex('SO9'))).toBe(false)
    expect(isTip(stubThrow({ left: 23 }), aimIndex('SO7'))).toBe(false)
  })

  it('is false when the dart busted', () => {
    expect(isTip(stubThrow({ left: 50, bust: true }), aimIndex('Bull'))).toBe(false)
  })
})

describe('strategy notes: the wrong number', () => {
  it('notes the last dart in 20 on 57 (S17 leaves 40)', () => {
    const n = noteOn(97, ['S20', 'S20', 'S20'], 2)
    // fin[37][1] === 0 (37 is odd: no one-dart finish) pins this exact wording
    expect(n).toMatchObject({ left: 57, darts: 1, thrown: 'S20', reason: 'S20 leaves 37, with no one-dart finish' })
    expect(n!.better).toMatch(/17/)
    // Without a position the dart may have gone at the 25 (leaving 32), which costs less
    expect(n!.cost).toBeGreaterThan(0.07)
    // In the outer single it can't have
    const placed = numberCost(evaluator(97, 1)(57, 1), 20, nearBull(dart('S20', outer(20))))
    expect(placed.cost).toBeGreaterThan(0.1)
    // With one dart left, nobody can "set up" anything: not a Tip (see 'strategy notes: tips' below)
    expect(n!.tip).toBe(false)
  })

  it('notes the last dart in 20 on 47', () => {
    // fin[27][1] === 0 (27 is odd: no one-dart finish)
    const n = noteOn(87, ['S20', 'S20', 'S20'], 2)
    expect(n).toMatchObject({ left: 47, thrown: 'S20', better: 'S7', reason: 'S20 leaves 27, with no one-dart finish' })
    expect(n!.cost).toBeGreaterThan(0.08)
  })

  it('notes a dart that busts far from the number it wanted (S14 on 7, S5 on 3)', () => {
    // A bust is its own mistake, not a setup choice: not a Tip.
    const seven = noteOn(7, ['S14'], 0)
    expect(seven).toMatchObject({ left: 7, darts: 3, better: 'S3', reason: 'S14 busts', tip: false })
    expect(seven!.cost).toBeGreaterThan(0.15)
    const three = noteOn(3, ['S5'], 0)
    expect(three).toMatchObject({ left: 3, darts: 3, better: 'S1', reason: 'S5 busts', tip: false })
    expect(three!.cost).toBeGreaterThan(0.1)
  })

  it('notes a dart in 20 on 23 with two darts left', () => {
    // fin[3][1] === 0 (3 is odd: the one dart left after this one can't finish it). 23 has no
    // one-dart out of its own (it's odd), so the better aim (S7) isn't "the direct out": not a Tip.
    // Only just over the threshold: an aim on the 5 next to 20 sets up 18 or 13.
    const n = noteOn(43, ['S20', 'S20', 'S1'], 1)
    expect(n).toMatchObject({ left: 23, darts: 2, better: 'S7', reason: "S20 leaves 3, which one dart can't finish", tip: false })
    expect(n!.cost).toBeGreaterThan(NOTE_THRESHOLD)
  })

  it('notes a dart in 1 on 47 with two darts left, clear of the threshold', () => {
    // fin[46][1] === 0 (no one-dart finish for the one dart left)
    const n = noteOn(67, ['S20', 'S1', 'S1'], 1)
    expect(n).toMatchObject({ left: 47, darts: 2, better: 'S15', reason: "S1 leaves 46, which one dart can't finish", tip: false })
    expect(n!.cost).toBeGreaterThan(0.08)
  })
})

describe('strategy notes: no reason', () => {
  it('gives none when the dart just leaves a score (32 in 20: S20 leaves 12)', () => {
    // The better aim is D16, 32's own direct out: a Tip when nobody is on an out (below).
    expect(noteOn(32, ['S20'], 0)).toMatchObject({ left: 32, darts: 3, thrown: 'S20', reason: null, tip: true })
  })
})

describe('strategy notes: no note', () => {
  it.each([
    ['99 in 20', 99, ['S20', 'S19', 'S20']],
    ['119 in 20', 119, ['T20', 'S19', 'S20']],
    ['65 in 25', 65, ['25', 'D20']],
    ['90 in 18', 90, ['S18', 'S20']],
    ['3 in T1 (S1 is on the same number)', 3, ['T1']],
    ['60 in T20 (S20 is on the same number)', 60, ['T20']],
  ])('%s', (_label, start, names) => {
    expect(noteOn(start, names, 0)).toBeUndefined()
  })

  it('excuses a miss into a number next to the best aim (2: D1 → 20, 18; 3: S1 → 20; 32: D16 → 8, 7)', () => {
    for (const n of ['S20', 'S18']) expect(noteOn(2, [n], 0)).toBeUndefined()
    expect(noteOn(3, ['S20'], 0)).toBeUndefined()
    for (const n of ['S8', 'S7']) expect(noteOn(32, [n], 0)).toBeUndefined()
  })

  it('excuses a single near the middle on a bull or 25 aim (162: T20 S20 S19 on 82; 101: S20 S20 S1 on 61)', () => {
    expect(noteOn(162, ['T20', 'S20', 'S19'], 2)).toBeUndefined()
    expect(noteOn(101, ['S20', 'S20', 'S1'], 2)).toBeUndefined()
    const at = (left: number, n: number, coords: { x: number; y: number }) =>
      numberCost(evaluator(left, 1)(left, 1), n, nearBull(dart(`S${n}`, coords))).cost
    expect(at(82, 19, inner(19))).toBe(0)
    expect(at(61, 1, inner(1))).toBe(0)
    // Out in the outer single, the 19 wasn't thrown at the bull
    expect(at(82, 19, outer(19))).toBeGreaterThan(NOTE_THRESHOLD)
  })

  it('notes no inner single when the best aim is the bull or 25 (probe over 2–170, 1–3 darts)', () => {
    let aimed = 0
    const noted: string[] = []
    for (let left = 2; left <= 170; left++)
      for (let darts = 1; darts <= 3; darts++) {
        const evaluate = evaluator(left, 1)
        const v = evaluate(left, darts).values
        const best = AIMS[v.indexOf(Math.max(...v))].id
        if (best !== 'Bull' && best !== '25') continue
        for (let n = 1; n <= 20; n++) {
          aimed++
          const { cost } = numberCost(evaluate(left, darts), n, nearBull(dart(`S${n}`, inner(n))))
          if (cost >= NOTE_THRESHOLD) noted.push(`${left}/${darts} S${n}`)
        }
      }
    expect(aimed).toBeGreaterThan(0)
    expect(noted).toEqual([])
  })

  it('never notes the dart that checks out, or darts with more than 170 left', () => {
    expect(solo(50, ['Bull'])).toEqual([])
    expect(solo(501, ['S5', 'S1', 'S12'])).toEqual([])
  })

  it('skips a typed-in miss it cannot place', () => {
    expect(solo(57, ['Miss', 'Miss', 'Miss'])).toEqual([])
  })
})

describe('strategy notes: the opponent', () => {
  it('lets a setup slide when the opponent is about to finish', () => {
    const withOpponent = (oppLeft: number) =>
      strategyNotes(throwsOf([leg([visit(1, oppLeft, []), visit(0, 97, ['S20', 'S20', 'S20'])])], 0, 501, REF), REF).find(n => n.dart === 2)
    expect(withOpponent(301)).toBeDefined()
    expect(withOpponent(32)).toBeUndefined()
  })
})

describe('strategy notes: tips', () => {
  // 50 left with 3 darts: S18 (setting up 32) turns out to already be the model's own best aim
  // there (cost 0, no note at all), so there's no note to tag. 24 left does give a real note: the
  // better aim is D12, 24's own direct out, over S14 (setting up 10) by a clear margin.
  it('is a note with tip: true when nobody is on an out (24 left: S14 instead of the direct D12)', () => {
    const n = noteOn(24, ['S14', 'S1', 'S1'], 0)
    expect(n).toMatchObject({ left: 24, darts: 3, thrown: 'S14', better: 'D12', betterAimId: 'D12' })
    expect(n!.cost).toBeGreaterThan(0.05)
    expect(n!.tip).toBe(true)
  })

  it('is tip: false for the same dart when the opponent is on 32, an out', () => {
    const withOpponent = strategyNotes(throwsOf([leg([visit(1, 32, []), visit(0, 24, ['S14', 'S1', 'S1'])])], 0, 501, REF), REF).find(
      note => note.dart === 0,
    )
    expect(withOpponent).toBeDefined()
    expect(withOpponent!.cost).toBeGreaterThan(NOTE_THRESHOLD) // the note still fires; opponentOnOut alone drops the tip
    expect(withOpponent!.tip).toBe(false)
  })
})

describe('strategy notes: the book', () => {
  it('never notes the first dart of a route in our checkout table', () => {
    const number = (label: string) => (label === 'Bull' || label === '25' ? 25 : Number(label.slice(1)))
    const costly: string[] = []
    for (const [score, entry] of Object.entries(CHECKOUTS)) {
      const firsts = [...entry.routes.map(r => [r[0], 3] as const), ...(entry.twoDarts ? [[entry.twoDarts[0], 2] as const] : [])]
      for (const [label, darts] of firsts) {
        const { cost } = numberCost(evaluator(Number(score), 1)(Number(score), darts), number(label))
        if (cost >= NOTE_THRESHOLD) costly.push(`${score}/${darts} ${label}: ${(cost * 100).toFixed(1)}`)
      }
    }
    expect(costly).toEqual([])
  })

  it('shows the book route with a note', () => {
    expect(noteOn(97, ['S20', 'S20', 'S20'], 2)!.book).toEqual(null) // no one-dart finish on 57
    expect(noteOn(43, ['S20', 'S20', 'S1'], 1)!.book).toEqual(['S7', 'D8'])
  })
})
