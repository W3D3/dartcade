import { describe, it, expect } from 'vitest'
import { validateHole } from './hole.js'
import type { Hole, Pt } from './types.js'

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
    expect(validateHole({ ...ok, slopes: [{ radial: { center: [200, 600], radius: 0, strength: 500 } }] })).toContain(
      'slope 1 radius must be positive',
    )
    expect(validateHole({ ...ok, slopes: [{ bump: { from: [100, 600], to: [100, 600], width: 100, strength: 300 } }] })).toContain(
      'slope 1 ridge needs two different ends',
    )
    expect(validateHole({ ...ok, slopes: [{ bump: { from: [0, 600], to: [400, 600], width: -1, strength: 300 } }] })).toContain(
      'slope 1 width must be positive',
    )
  })
  it('rejects non-finite numbers and bad sizes', () => {
    expect(validateHole({ ...ok, tee: [Number.NaN, 0] })).toContain('tee has a non-finite number')
    expect(validateHole({ ...ok, cup: { at: [200, 150], r: 0 } })).toContain('cup radius must be positive')
    expect(validateHole({ ...ok, bumpers: [{ at: [200, 600], r: -1 }] })).toContain('bumper 1 radius must be positive')
    expect(validateHole({ ...ok, walls: [{ points: [[10, 10]] }] })).toContain('wall 1 needs at least 2 points')
  })
  it('rejects terrain that cannot be built', () => {
    const mesa = { from: [0, 0] as Pt, to: [100, 100] as Pt, height: 100, edges: [50, 50, 50, 50] as [number, number, number, number] }
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, height: NaN } }] })).toContain('terrain 1 has a non-finite number')
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, edges: [50, 0, 50, 50] } }] })).toContain('terrain 1 edges must be positive')
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, to: [0, 100] } }] })).toContain('terrain 1 needs an area')
  })
})
