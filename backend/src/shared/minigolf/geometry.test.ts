import { describe, it, expect } from 'vitest'
import { bounds, pointInPolygon, segmentsIntersect } from './geometry.js'

const square = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
] as const

describe('geometry', () => {
  it('finds points inside and outside a polygon', () => {
    expect(pointInPolygon([50, 50], square)).toBe(true)
    expect(pointInPolygon([150, 50], square)).toBe(false)
    // An L shape: the notch is outside
    const l = [
      [0, 0],
      [100, 0],
      [100, 40],
      [40, 40],
      [40, 100],
      [0, 100],
    ] as const
    expect(pointInPolygon([70, 70], l)).toBe(false)
    expect(pointInPolygon([20, 70], l)).toBe(true)
  })
  it('detects crossing segments, not touching neighbours', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true)
    expect(segmentsIntersect([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false)
  })
  it('measures bounds', () => {
    expect(bounds(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })
})
