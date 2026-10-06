import { describe, it, expect } from 'vitest'
import { checkoutHint } from './checkout.js'
import { CHECKOUTS } from './checkoutTable.js'

const scoreOf = (label: string): number => {
  if (label === 'Bull') return 50
  if (label === '25') return 25
  const mult = label[0] === 'T' ? 3 : label[0] === 'D' ? 2 : 1
  return mult * parseInt(label.slice(1), 10)
}

const total = (route: string[]) => route.reduce((a, l) => a + scoreOf(l), 0)
const finishesOnADouble = (route: string[]) => route.at(-1) === 'Bull' || route.at(-1)?.startsWith('D') === true

describe('the checkout table', () => {
  it('every route adds up to its score and ends on a double', () => {
    for (const [score, entry] of Object.entries(CHECKOUTS)) {
      for (const route of [...entry.routes, ...(entry.twoDarts ? [entry.twoDarts] : [])]) {
        expect({ score, route, total: total(route) }).toEqual({ score, route, total: Number(score) })
        expect(finishesOnADouble(route)).toBe(true)
      }
      expect(entry.twoDarts?.length ?? 2).toBe(2)
    }
  })

  it('covers every score from 41 to 170 that can be finished in three darts', () => {
    const missing = Array.from({ length: 130 }, (_, i) => 41 + i).filter(n => !(n in CHECKOUTS))
    expect(missing).toEqual([159, 162, 163, 165, 166, 168, 169])
  })
})

describe('checkoutHint, double out', () => {
  it("follows the pros' routes", () => {
    expect(checkoutHint(170)).toEqual(['T20', 'T20', 'Bull'])
    expect(checkoutHint(81)).toEqual(['T19', 'D12'])
    // "16/8, D16/D20" in the table: the first field
    expect(checkoutHint(108)).toEqual(['T20', 'S16', 'D16'])
    // A setup shot rather than the bull
    expect(checkoutHint(50)).toEqual(['S10', 'D20'])
  })

  it('with two darts left: the two-dart route', () => {
    expect(checkoutHint(110, 'double', 2)).toEqual(['T20', 'Bull'])
    expect(checkoutHint(70, 'double', 2)).toEqual(['T20', 'D5'])
    expect(checkoutHint(81, 'double', 2)).toEqual(['T19', 'D12'])
    expect(checkoutHint(120, 'double', 2)).toBeNull()
  })

  it('with one dart left: only a double (or the bull) that finishes', () => {
    expect(checkoutHint(50, 'double', 1)).toEqual(['Bull'])
    expect(checkoutHint(32, 'double', 1)).toEqual(['D16'])
    expect(checkoutHint(39, 'double', 1)).toBeNull()
    expect(checkoutHint(60, 'double', 1)).toBeNull()
  })

  it('40 and under: a double, or a single that leaves one, halving down from D16', () => {
    expect(checkoutHint(40)).toEqual(['D20'])
    expect(checkoutHint(39)).toEqual(['S7', 'D16'])
    expect(checkoutHint(21)).toEqual(['S5', 'D8'])
    expect(checkoutHint(3)).toEqual(['S1', 'D1'])
  })

  it("can't finish 1, a bogey number, or more than 170", () => {
    expect([checkoutHint(1), checkoutHint(159), checkoutHint(169), checkoutHint(171), checkoutHint(0)]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('a favourite double picks the route ending on it, and is set up below 41', () => {
    expect(checkoutHint(52)).toEqual(['S12', 'D20'])
    expect(checkoutHint(52, 'double', 3, { favouriteDouble: 16 })).toEqual(['S20', 'D16'])
    expect(checkoutHint(85, 'double', 3, { favouriteDouble: 14 })).toEqual(['T19', 'D14'])
    // No route ends on it: the table's first
    expect(checkoutHint(170, 'double', 3, { favouriteDouble: 16 })).toEqual(['T20', 'T20', 'Bull'])
    expect(checkoutHint(39, 'double', 3, { favouriteDouble: 18 })).toEqual(['S3', 'D18'])
  })
})

describe('checkoutHint, straight and master out', () => {
  it('straight out: the easiest dart finishes (a single before a double before a triple)', () => {
    expect(checkoutHint(18, 'straight')).toEqual(['S18'])
    expect(checkoutHint(3, 'straight')).toEqual(['S3'])
    expect(checkoutHint(40, 'straight')).toEqual(['D20'])
    expect(checkoutHint(60, 'straight')).toEqual(['T20'])
  })
  it('master out: a double before a triple', () => {
    expect(checkoutHint(18, 'master')).toEqual(['D9'])
    expect(checkoutHint(57, 'master')).toEqual(['T19'])
  })
})
