import { describe, it, expect } from 'vitest'
import { barHeights, busiestSlot, dayBars, formatCount, heatLevel, modeColor, percent, trend } from './activity'

describe('trend', () => {
  it('shows the change in whole percent with its arrow', () => {
    expect(trend(118, 100)).toEqual({ label: '▲ 18%', up: true })
    expect(trend(98, 100)).toEqual({ label: '▼ 2%', up: false })
  })
  it('has no trend against nothing', () => {
    expect(trend(5, 0)).toBeNull()
  })
})

describe('percent', () => {
  it('rounds, keeping a decimal below ten percent', () => {
    expect(percent(0.114)).toBe('11%')
    expect(percent(0.034)).toBe('3.4%')
    expect(percent(0)).toBe('0%')
  })
})

describe('formatCount', () => {
  it('groups thousands with a thin gap', () => {
    expect(formatCount(1284)).toBe('1 284')
  })
})

describe('dayBars', () => {
  it('scales every mode against the busiest day and skips modes with no games', () => {
    const bars = dayBars([{ x01: 3, cricket: 1 }, { x01: 1 }], ['x01', 'cricket'], new Date('2026-11-15'))
    expect(bars.map(b => b.total)).toEqual([4, 1])
    expect(bars[0].parts).toEqual([
      { mode: 'x01', count: 3, height: 75 },
      { mode: 'cricket', count: 1, height: 25 },
    ])
    expect(bars[1].parts).toEqual([{ mode: 'x01', count: 1, height: 25 }])
    expect(bars[0].day.toISOString().slice(0, 10)).toBe('2026-11-14')
  })
})

describe('barHeights', () => {
  it('is all zero for an empty week instead of dividing by zero', () => {
    expect(barHeights([0, 0])).toEqual([0, 0])
    expect(barHeights([1, 2])).toEqual([50, 100])
  })
})

describe('heatLevel and busiestSlot', () => {
  it('buckets by share of the busiest cell', () => {
    expect([0, 1, 5, 10].map(n => heatLevel(n, 10))).toEqual([0, 1, 2, 4])
  })
  it('names the busiest two hours, or nothing', () => {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    expect(busiestSlot(grid)).toBeNull()
    grid[5][20] = 4
    grid[5][21] = 3
    expect(busiestSlot(grid)).toBe('Sat 20–22 h')
  })
})

describe('modeColor', () => {
  it('follows the legend order and reuses the last colour past the palette', () => {
    const modes = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(modeColor(modes, 'a')).toBe('bg-accent')
    expect(modeColor(modes, 'g')).toBe('bg-ink-faint')
  })
})
