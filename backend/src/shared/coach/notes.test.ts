import { describe, it, expect } from 'vitest'
import { CHECKOUTS } from '../checkoutTable.js'
import { NOTE_THRESHOLD, numberCost, strategyNotes } from './notes.js'
import { evaluator } from './model.js'
import { leg, visit } from './testLegs.js'
import { throwsOf } from './walk.js'

const solo = (start: number, names: string[]) => strategyNotes(throwsOf([leg([visit(0, start, names)])], 0, 501))
const noteOn = (start: number, names: string[], dart: number) => solo(start, names).find(n => n.dart === dart)

describe('strategy notes: the wrong number', () => {
  it('notes the last dart in 20 on 57 (S17 leaves 40)', () => {
    const n = noteOn(97, ['S20', 'S20', 'S20'], 2)
    // fin[37][1] === 0 (37 is odd: no one-dart finish) pins this exact wording
    expect(n).toMatchObject({ left: 57, darts: 1, thrown: 'S20', reason: 'S20 leaves 37, with no one-dart finish' })
    expect(n!.better).toMatch(/17/)
    expect(n!.cost).toBeGreaterThan(0.1)
  })

  it('notes the last dart in 20 on 47', () => {
    // fin[27][1] === 0 (27 is odd: no one-dart finish)
    expect(noteOn(87, ['S20', 'S20', 'S20'], 2)).toMatchObject({
      left: 47,
      thrown: 'S20',
      reason: 'S20 leaves 27, with no one-dart finish',
    })
  })

  it('notes a dart at 20 on 7 and on 3, where 20 busts', () => {
    // 7 - 20 < 2 (a bust): the single 20 busts
    const seven = noteOn(7, ['S20'], 0)
    expect(seven).toMatchObject({ left: 7, darts: 3, reason: 'S20 busts' })
    expect(noteOn(3, ['S20'], 0)).toMatchObject({ left: 3, darts: 3, reason: 'S20 busts' })
  })

  it('notes a dart in 20 on 23 with two darts left', () => {
    // fin[3][1] === 0 (3 is odd: the one dart left after this one can't finish it)
    expect(noteOn(43, ['S20', 'S20', 'S1'], 1)).toMatchObject({
      left: 23,
      darts: 2,
      reason: "S20 leaves 3, which one dart can't finish",
    })
  })
})

describe('strategy notes: no reason', () => {
  it('gives none when the worst outcome just leaves a score (32 in 20: S20 leaves 12)', () => {
    expect(noteOn(32, ['S20'], 0)).toMatchObject({ left: 32, darts: 3, thrown: 'S20', reason: null })
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
      strategyNotes(throwsOf([leg([visit(1, oppLeft, []), visit(0, 97, ['S20', 'S20', 'S20'])])], 0, 501)).find(n => n.dart === 2)
    expect(withOpponent(301)).toBeDefined()
    expect(withOpponent(32)).toBeUndefined()
  })
})

describe('strategy notes: the book', () => {
  it("never notes the first dart of a route in our checkout table (but 45's alternative S19)", () => {
    const number = (label: string) => (label === 'Bull' || label === '25' ? 25 : Number(label.slice(1)))
    const costly: string[] = []
    for (const [score, entry] of Object.entries(CHECKOUTS)) {
      const firsts = [...entry.routes.map(r => [r[0], 3] as const), ...(entry.twoDarts ? [[entry.twoDarts[0], 2] as const] : [])]
      for (const [label, darts] of firsts) {
        if (score === '45' && label === 'S19') continue
        const { cost } = numberCost(evaluator(Number(score), 1), Number(score), darts, number(label))
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
