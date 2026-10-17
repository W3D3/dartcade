import { describe, it, expect } from 'vitest'
import { validateHole } from './hole.js'
import { holeSchema } from './holeSchema.js'
import type { Curve, Hole, Pt } from './types.js'

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
    expect(validateHole({ ...ok, cup: { at: [200, 150], r: 0 } })).toContain("cup radius must be more than the ball's (21.35 mm)")
    expect(validateHole({ ...ok, cup: { at: [200, 150], r: 15 } })).toContain("cup radius must be more than the ball's (21.35 mm)")
    expect(validateHole({ ...ok, bumpers: [{ at: [200, 600], r: -1 }] })).toContain('bumper 1 radius must be positive')
    expect(validateHole({ ...ok, walls: [{ points: [[10, 10]] }] })).toContain('wall 1 needs at least 2 points')
    expect(
      validateHole({
        ...ok,
        walls: [
          {
            points: [
              [0, 0],
              [100, 0],
            ],
            thickness: 0,
          },
        ],
      }),
    ).toContain('wall 1 thickness must be positive')
  })
  it('rejects a shape whose curves do not match its corners, and a non-positive circle', () => {
    expect(validateHole({ ...ok, shape: { corners: ok.outline, curves: [null], circles: [] } })).toContain(
      'shape curves must match its corners',
    )
    expect(
      validateHole({
        ...ok,
        shape: { corners: ok.outline, curves: ok.outline.map(() => null), circles: [{ center: [200, 600], r: 0 }] },
      }),
    ).toContain('circle 1 radius must be positive')
    expect(
      validateHole({
        ...ok,
        shape: { corners: ok.outline, curves: ok.outline.map(() => null), circles: [{ center: [Number.NaN, 600], r: 100 }] },
      }),
    ).toContain('circle 1 must have finite numbers')
    expect(
      validateHole({
        ...ok,
        shape: { corners: ok.outline, curves: ok.outline.map(() => null), circles: [{ center: [200, 600], r: 100 }] },
      }),
    ).toEqual([])
  })
  it('rejects non-finite numbers in shape corners and curves', () => {
    const corners: Pt[] = [...ok.outline]
    corners[1] = [Number.NaN, 0]
    expect(validateHole({ ...ok, shape: { corners, curves: corners.map(() => null), circles: [] } })).toContain(
      'shape corner 2 must have finite numbers',
    )
    const curves = ok.outline.map(() => null as Curve | null)
    curves[0] = { c1: [0, 0], c2: [Infinity, 0] }
    expect(validateHole({ ...ok, shape: { corners: ok.outline, curves, circles: [] } })).toContain('curve 1 must have finite numbers')
  })
  it('rejects terrain that cannot be built', () => {
    const mesa = { from: [0, 0] as Pt, to: [100, 100] as Pt, height: 100, edges: [50, 50, 50, 50] as [number, number, number, number] }
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, height: NaN } }] })).toContain('terrain 1 has a non-finite number')
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, edges: [50, 0, 50, 50] } }] })).toContain('terrain 1 edges must be positive')
    expect(validateHole({ ...ok, terrain: [{ mesa: { ...mesa, to: [0, 100] } }] })).toContain('terrain 1 needs an area')
  })
  it('rejects an outline over 20 m across', () => {
    const strip: Pt[] = [
      [0, 0],
      [600, 0],
      [600, 400_000],
      [0, 400_000],
    ]
    expect(validateHole({ ...ok, outline: strip })).toContain('outline is more than 20 m across')
  })
})

describe('holeSchema', () => {
  it('refuses holes with absurdly many points or pieces', () => {
    expect(holeSchema.safeParse(ok).success).toBe(true)
    const outline = Array.from({ length: 2001 }, (_, k): Pt => [Math.cos(k), Math.sin(k)])
    expect(holeSchema.safeParse({ ...ok, outline }).success).toBe(false)
    const bumpers = Array.from({ length: 101 }, () => ({ at: [200, 600], r: 30 }))
    expect(holeSchema.safeParse({ ...ok, bumpers }).success).toBe(false)
  })
})
