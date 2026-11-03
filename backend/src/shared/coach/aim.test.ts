import { describe, it, expect } from 'vitest'
import { AIMS } from './aims.js'
import { R } from '../board.js'
import { candidates, landedNumber, nearBull } from './aim.js'
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
  it('are every aim on the number or either neighbour, wires included', () => {
    const ids = candidates(20)
      .map(i => AIMS[i].id)
      .sort()
    const on = (n: number) => [`T${n}`, `D${n}`, `SO${n}`, `SI${n}`]
    expect(ids).toEqual([...on(5), ...on(20), ...on(1), 'W12-5', 'W5-20', 'W20-1', 'W1-18'].sort())
    expect(
      candidates(25)
        .map(i => AIMS[i].id)
        .sort(),
    ).toEqual(['25', 'Bull'])
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

  it('adds the bull and 25 to the candidates', () => {
    const ids = candidates(20, true).map(i => AIMS[i].id)
    expect(ids).toEqual(expect.arrayContaining(['Bull', '25', 'T20', 'SO1']))
    expect(ids).toHaveLength(candidates(20).length + 2)
  })
})
