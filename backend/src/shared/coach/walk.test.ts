import { describe, it, expect } from 'vitest'
import { R } from '../board.js'
import { landedNumber, nearBull, throwsOf, walkVisit } from './walk.js'
import { dart, leg, visit, REF } from './testLegs.js'

const { fin } = REF

describe('throwsOf', () => {
  it('gives the score before each dart and the darts left', () => {
    const t = throwsOf([leg([visit(0, 501, ['T20', 'T20', 'S20'])])], 0, 501, REF)
    expect(t.map(x => [x.left, x.darts])).toEqual([
      [501, 3],
      [441, 2],
      [381, 1],
    ])
    expect(t.every(x => x.start === 501)).toBe(true)
  })

  it('rebuilds a busting visit from its start, not from what was left after it', () => {
    // 40 left: S20 (20), S19 busts. The game stores remaining 40, scored 0.
    const t = throwsOf([leg([visit(0, 40, ['S20', 'S19'])])], 0, 501, REF)
    expect(t.map(x => [x.left, x.bust])).toEqual([
      [40, false],
      [20, true],
    ])
  })

  it('stops at the busting dart: the darts after it score nothing', () => {
    // 32 left: T20 busts; the game keeps the S16 and D8 thrown after it
    const v = visit(0, 32, ['T20', 'S16', 'D8'])
    expect(v).toMatchObject({ remaining: 32, scored: 0, bust: true })
    expect(v.darts).toHaveLength(3)
    expect(throwsOf([leg([v])], 0, 501, REF).map(x => [x.d.segment.name, x.left, x.bust])).toEqual([['T20', 32, true]])
  })

  it('marks the dart that checks out', () => {
    const t = throwsOf([leg([visit(0, 40, ['D20'])])], 0, 501, REF)
    expect(t[0].checkout).toBe(true)
  })

  it("only walks the chosen seat, with w from the opponent's score", () => {
    const l = leg([visit(1, 501, ['T20']), visit(1, 32, []), visit(0, 97, ['S20', 'S20', 'S20'])])
    // The opponent's last visit left them on 32 (the empty visit stands for "they are on 32")
    const t = throwsOf([l], 0, 501, REF)
    expect(t).toHaveLength(3)
    expect(t[0].w).toBeCloseTo(1 - fin[32][3], 10)
  })

  it('gives w = 1 solo and before the opponent has thrown', () => {
    expect(throwsOf([leg([visit(0, 501, ['S20'])])], 0, 501, REF)[0].w).toBe(1)
    // The opponent hasn't thrown in this leg yet: still on 501, no finish
    const t = throwsOf([leg([visit(0, 501, ['S20']), visit(1, 501, ['S20'])])], 0, 501, REF)
    expect(t[0].w).toBe(1)
  })

  it("is empty for a seat that didn't throw", () => {
    expect(throwsOf([leg([visit(1, 501, ['T20'])])], 0, 501, REF)).toEqual([])
  })

  describe('opponentOnOut', () => {
    const withOpponent = (oppLeft: number) => throwsOf([leg([visit(1, oppLeft, []), visit(0, 97, ['S20'])])], 0, 501, REF)[0].opponentOnOut

    it('is true when the opponent is left on a number a visit can check out', () => {
      expect(withOpponent(32)).toBe(true)
    })

    it("is false when the opponent's left can't be checked out in three darts (301, 169)", () => {
      expect(withOpponent(301)).toBe(false)
      expect(withOpponent(169)).toBe(false)
    })
  })
})

describe('walkVisit', () => {
  it('walks to the busting dart and leaves out the darts after it', () => {
    expect(
      walkVisit(
        32,
        ['S16', 'T20', 'D8'].map(n => dart(n)),
      ),
    ).toEqual([
      { left: 32, after: 16, checkout: false, bust: false },
      { left: 16, after: 32, checkout: false, bust: true },
    ])
    expect(walkVisit(40, [dart('D20')])).toEqual([{ left: 40, after: 0, checkout: true, bust: false }])
  })
})

describe('landedNumber', () => {
  it('reads the number, with the bull and 25 as 25', () => {
    expect([landedNumber(dart('T20')), landedNumber(dart('S5')), landedNumber(dart('Bull')), landedNumber(dart('25'))]).toEqual([
      20, 5, 25, 25,
    ])
  })

  it('places a miss off the board by its position, and gives up without one', () => {
    expect(landedNumber(dart('Miss', { x: 0, y: 1.05 }))).toBe(20)
    expect(landedNumber(dart('Miss'))).toBeNull()
  })
})

describe('nearBull', () => {
  it('is a single inside the inner single ring, or one without a position', () => {
    expect(nearBull(dart('S19', { x: 0.1, y: -0.2 }))).toBe(true)
    expect(nearBull(dart('S19'))).toBe(true)
    expect(nearBull(dart('S20', { x: 0, y: R.si + 0.01 }))).toBe(false)
    expect(nearBull(dart('T20'))).toBe(false)
    expect(nearBull(dart('25'))).toBe(false)
  })
})
