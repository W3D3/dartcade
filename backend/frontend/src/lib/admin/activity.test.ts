import { describe, it, expect } from 'vitest'
import {
  bucketName,
  bucketRange,
  bucketTick,
  bucketize,
  busiestSlot,
  defaultGranularity,
  formatCount,
  heatLevel,
  modeColor,
  percent,
  trend,
} from './activity'

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

describe('bucketize', () => {
  // 2026-11-11 is a Wednesday; eight days end on Wednesday the 18th
  const today = new Date('2026-11-18T10:00:00Z')
  const perDay = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ x01: n }))

  it('keeps a day per bucket', () => {
    const days = bucketize(perDay, today, 'day')
    expect(days).toHaveLength(8)
    expect(days.at(-1)).toMatchObject({ total: 8, parts: { x01: 8 } })
    expect(bucketRange(days.at(-1)!)).toEqual({ from: '2026-11-18T00:00:00.000Z', to: '2026-11-19T00:00:00.000Z' })
  })
  it('adds up Monday-first weeks, the first one only for the days the range has', () => {
    const weeks = bucketize(perDay, today, 'week')
    expect(weeks.map(w => w.total)).toEqual([15, 21])
    expect(weeks[0].start.toISOString()).toBe('2026-11-09T00:00:00.000Z')
    expect(weeks[0].from.toISOString()).toBe('2026-11-11T00:00:00.000Z')
    expect(weeks[0].to.toISOString()).toBe('2026-11-16T00:00:00.000Z')
  })
  it('adds up months and sums every mode', () => {
    const months = bucketize([{ x01: 1, cricket: 2 }, { x01: 4 }], new Date('2026-12-01T00:00:00Z'), 'month')
    expect(months.map(m => m.total)).toEqual([3, 4])
    expect(months[0].parts).toEqual({ x01: 1, cricket: 2 })
  })
  it('names a bucket for the axis and the panel title', () => {
    const [d] = bucketize([{ x01: 1 }], today, 'day')
    expect(bucketTick(d, 'day')).toBe('Nov 18')
    expect(bucketName(d, 'day')).toBe('Wednesday, Nov 18')
    const [w] = bucketize([{ x01: 1 }], today, 'week')
    expect(bucketName(w, 'week')).toBe('Week of Mon, Nov 16')
    const [m] = bucketize([{ x01: 1 }], today, 'month')
    expect(bucketTick(m, 'month')).toBe('Nov 2026')
    expect(bucketName(m, 'month')).toBe('November 2026')
  })
  it('opens long ranges as weeks or months', () => {
    expect([7, 30, 90, 0].map(r => defaultGranularity(r as 7))).toEqual(['day', 'day', 'week', 'month'])
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
