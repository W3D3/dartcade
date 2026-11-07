import { describe, expect, it } from 'vitest'
import { chartGrid, integerTicks, xPositions } from '../charts/grid.js'

describe('integerTicks', () => {
  it('numbers every step while they fit', () => {
    expect(integerTicks(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(integerTicks(1, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
  it('steps evenly from the first one once they would crowd', () => {
    expect(integerTicks(1, 13)).toEqual([2, 4, 6, 8, 10, 12])
    expect(integerTicks(1, 40)).toEqual([5, 10, 15, 20, 25, 30, 35, 40])
  })
  it('only ever returns whole, ascending, bounded numbers', () => {
    for (const to of [1, 2, 5, 11, 12, 13, 24, 25, 99, 150]) {
      const ticks = integerTicks(1, to)
      expect(ticks.length).toBeLessThanOrEqual(12)
      expect(ticks.every(t => Number.isInteger(t) && t <= to)).toBe(true)
      const steps = new Set(ticks.slice(1).map((t, i) => t - ticks[i]))
      expect(steps.size).toBeLessThanOrEqual(1)
    }
  })
  it('is empty when there is nothing to number', () => {
    expect(integerTicks(1, 0)).toEqual([])
  })
})

describe('xPositions', () => {
  it('lists each x once, ascending', () => {
    expect(xPositions([3, 1, 3, 2, 1])).toEqual([1, 2, 3])
  })
})

describe('chartGrid', () => {
  it('draws a vertical rule at each point and keeps the horizontal grid', () => {
    const g = chartGrid([1, 2], { class: 'stroke-x', strokeWidth: 1, yTicks: [0, 5] })
    expect(g.xTicks).toEqual([1, 2])
    expect(g.yTicks).toEqual([0, 5])
    expect(g.x).toBeTruthy()
    expect(g.y).toEqual({ class: 'stroke-x', strokeWidth: 1 })
  })
  it('can leave the horizontal grid out', () => {
    expect(chartGrid([1], false).y).toBe(false)
  })
})
