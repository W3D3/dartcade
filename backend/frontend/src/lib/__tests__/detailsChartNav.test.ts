import { describe, it, expect } from 'vitest'
import { flattenByX, stepFocus } from '../details/chartNav.js'

describe('flattenByX', () => {
  it('merges every series into one list ordered by x, not grouped by series', () => {
    const series = [
      {
        key: 'a',
        points: [
          { x: 0, v: 'a0' },
          { x: 2, v: 'a2' },
        ],
      },
      { key: 'b', points: [{ x: 1, v: 'b1' }] },
    ]
    expect(flattenByX(series, p => p.x).map(n => [n.seriesKey, n.point.v])).toEqual([
      ['a', 'a0'],
      ['b', 'b1'],
      ['a', 'a2'],
    ])
  })

  it('is stable for points sharing an x (keeps series order)', () => {
    const series = [
      { key: 'a', points: [{ x: 1, v: 'a1' }] },
      { key: 'b', points: [{ x: 1, v: 'b1' }] },
    ]
    expect(flattenByX(series, p => p.x).map(n => n.seriesKey)).toEqual(['a', 'b'])
  })

  it('is empty when every series is empty', () => {
    expect(flattenByX([{ key: 'a', points: [] }], (p: never) => p)).toEqual([])
  })
})

describe('stepFocus', () => {
  it('starts at the first point on ArrowRight from nothing focused', () => {
    expect(stepFocus(null, 1, 5)).toBe(0)
  })

  it('starts at the last point on ArrowLeft from nothing focused', () => {
    expect(stepFocus(null, -1, 5)).toBe(4)
  })

  it('steps forward and backward', () => {
    expect(stepFocus(2, 1, 5)).toBe(3)
    expect(stepFocus(2, -1, 5)).toBe(1)
  })

  it('clamps at both ends instead of wrapping', () => {
    expect(stepFocus(4, 1, 5)).toBe(4)
    expect(stepFocus(0, -1, 5)).toBe(0)
  })

  it('has nothing to focus when there are no points', () => {
    expect(stepFocus(null, 1, 0)).toBeNull()
    expect(stepFocus(0, 1, 0)).toBeNull()
  })
})
