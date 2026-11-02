import { describe, it, expect } from 'vitest'
import { AIMS } from './aims.js'
import { candidates, landedNumber, scoringAim } from './aim.js'
import { dart } from './testLegs.js'

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

describe('candidates', () => {
  it('are every aim on the number, the two wires next to it included', () => {
    const ids = candidates(20)
      .map(i => AIMS[i].id)
      .sort()
    expect(ids).toEqual(['D20', 'SI20', 'SO20', 'T20', 'W20-1', 'W5-20'].sort())
    expect(
      candidates(25)
        .map(i => AIMS[i].id)
        .sort(),
    ).toEqual(['25', 'Bull'])
  })
})

describe('scoringAim', () => {
  it('reads 20, 19, 18, 17 and their neighbours', () => {
    expect(scoringAim(dart('S5'), [])).toBe(20)
    expect(scoringAim(dart('T7'), [])).toBe(19)
    expect(scoringAim(dart('S4'), [])).toBe(18)
    expect(scoringAim(dart('S2'), [])).toBe(17)
  })

  it('leaves other numbers and the bull out', () => {
    expect(scoringAim(dart('S12'), [])).toBeNull()
    expect(scoringAim(dart('25'), [])).toBeNull()
    expect(scoringAim(dart('Miss'), [])).toBeNull()
  })

  it("splits 1 and 3 by the visit's other darts", () => {
    const one = dart('S1')
    expect(scoringAim(one, [dart('T20'), one, dart('S20')])).toBe(20)
    expect(scoringAim(one, [dart('S18'), one, dart('T18')])).toBe(18)
    const three = dart('S3')
    expect(scoringAim(three, [three, dart('S17'), dart('T17')])).toBe(17)
    // No other darts to go by: the higher-scoring aim
    expect(scoringAim(three, [three])).toBe(19)
  })

  it('splits by position when the darts have one', () => {
    const one = dart('S1', { x: 0.25, y: 0.75 })
    // The other darts sit in the 18, right of the 1
    expect(scoringAim(one, [one, dart('T18', { x: 0.33, y: 0.5 }), dart('S18', { x: 0.4, y: 0.6 })])).toBe(18)
  })
})
