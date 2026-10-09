import { describe, it, expect } from 'vitest'
import { validateHole } from './hole.js'
import type { Hole } from './types.js'

const ok: Hole = {
  id: 'h',
  name: 'H',
  par: 2,
  outline: [
    [0, 0],
    [400, 0],
    [400, 1200],
    [0, 1200],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [200, 1100],
  cup: { at: [200, 150], r: 54 },
}

describe('validateHole', () => {
  it('accepts a valid hole', () => expect(validateHole(ok)).toEqual([]))
  it('rejects a tee or cup outside the outline', () => {
    expect(validateHole({ ...ok, tee: [500, 100] })).toContain('tee is outside the outline')
    expect(validateHole({ ...ok, cup: { at: [-10, 0], r: 54 } })).toContain('cup is outside the outline')
  })
  it('rejects short and self-intersecting polygons', () => {
    expect(
      validateHole({
        ...ok,
        outline: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toContain('outline needs at least 3 points')
    expect(
      validateHole({
        ...ok,
        outline: [
          [0, 0],
          [400, 1200],
          [400, 0],
          [0, 1200],
        ],
      }),
    ).toContain('outline crosses itself')
    expect(
      validateHole({
        ...ok,
        slopes: [
          {
            area: [
              [0, 0],
              [1, 0],
            ],
            force: [0, 1],
          },
        ],
      }),
    ).toContain('slope 1 needs at least 3 points')
  })
  it('rejects non-finite numbers and bad sizes', () => {
    expect(validateHole({ ...ok, tee: [Number.NaN, 0] })).toContain('tee has a non-finite number')
    expect(validateHole({ ...ok, cup: { at: [200, 150], r: 0 } })).toContain('cup radius must be positive')
    expect(validateHole({ ...ok, bumpers: [{ at: [200, 600], r: -1 }] })).toContain('bumper 1 radius must be positive')
    expect(validateHole({ ...ok, walls: [{ points: [[10, 10]] }] })).toContain('wall 1 needs at least 2 points')
  })
})
