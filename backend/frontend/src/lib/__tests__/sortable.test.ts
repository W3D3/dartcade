import { describe, it, expect } from 'vitest'
import { dropTarget, edgeSpeed, type ZoneBox } from '../actions/sortable.js'

const box = (top: number, bottom: number, left = 0, right = 100) => ({ top, bottom, left, right })
// Two columns side by side, rows 40px tall
const zones: ZoneBox[] = [
  { zone: 'A', box: box(0, 200, 0, 100), items: [{ id: 'a1', box: box(10, 50) }, { id: 'a2', box: box(60, 100) }, { id: 'a3', box: box(110, 150) }] },
  { zone: 'B', box: box(0, 200, 120, 220), items: [{ id: 'b1', box: box(10, 50, 120, 220) }] },
]

describe('dropTarget', () => {
  it('drops before the first item whose middle is below the pointer', () => {
    expect(dropTarget(zones, 'a3', 50, 20)).toEqual({ zone: 'A', beforeId: 'a1' })
    expect(dropTarget(zones, 'a3', 50, 40)).toEqual({ zone: 'A', beforeId: 'a2' })
  })
  it('skips the dragged item, and drops at the end below the last one', () => {
    expect(dropTarget(zones, 'a2', 50, 70)).toEqual({ zone: 'A', beforeId: 'a3' })
    expect(dropTarget(zones, 'a1', 50, 190)).toEqual({ zone: 'A', beforeId: null })
  })
  it('picks the zone under the pointer, or the nearest one', () => {
    expect(dropTarget(zones, 'a1', 150, 5)).toEqual({ zone: 'B', beforeId: 'b1' })
    expect(dropTarget(zones, 'a1', 150, 120)).toEqual({ zone: 'B', beforeId: null })
    expect(dropTarget(zones, 'a1', 300, 20)).toEqual({ zone: 'B', beforeId: 'b1' })
    expect(dropTarget(zones, 'b1', -40, 20)).toEqual({ zone: 'A', beforeId: 'a1' })
    expect(dropTarget([], 'a1', 0, 0)).toBeNull()
  })
})

describe('edgeSpeed', () => {
  it('scrolls up near the top, down near the bottom, faster closer to the edge', () => {
    expect(edgeSpeed(300, 0, 600)).toBe(0)
    expect(edgeSpeed(40, 0, 600)).toBeLessThan(0)
    expect(edgeSpeed(0, 0, 600)).toBeLessThan(edgeSpeed(40, 0, 600))
    expect(edgeSpeed(560, 0, 600)).toBeGreaterThan(0)
    expect(edgeSpeed(620, 0, 600)).toBe(edgeSpeed(600, 0, 600))
  })
})
