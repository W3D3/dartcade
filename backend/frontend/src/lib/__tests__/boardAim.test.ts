import { describe, it, expect } from 'vitest'
import { aimOffsetFor, edgePush, moveAim, shownAt, viewBoxFor } from '../boardAim.js'

const box = { half: 1.15, margin: 0.1 }

describe('aim offset by pointer type', () => {
  it('offsets a touch pointer away from the finger', () => {
    expect(aimOffsetFor('touch', 70)).toBe(70)
  })

  it('places the aim right under a mouse pointer', () => {
    expect(aimOffsetFor('mouse', 70)).toBe(0)
  })

  it('places the aim right under a pen pointer', () => {
    expect(aimOffsetFor('pen', 70)).toBe(0)
  })
})

describe('long-press aim', () => {
  it('moves the aim at a third of the finger', () => {
    const a = moveAim({ x: 0.2, y: -0.4 }, { x: 0, y: 0 }, { x: 0.3, y: 0 }, 3)
    expect(a.x).toBeCloseTo(0.3)
    expect(a.y).toBeCloseTo(-0.4)
  })

  it('shows the aim the offset above the finger, kept inside the view', () => {
    const a = shownAt({ x: -0.1, y: 0.2 }, 0.1, box)
    expect([a.x, a.y].map(v => v.toFixed(6))).toEqual(['-0.100000', '0.100000'])
    const b = shownAt({ x: 2, y: -1.2 }, 0.1, box)
    expect([b.x, b.y].map(v => v.toFixed(6))).toEqual(['1.050000', '-1.050000'])
  })

  it('pushes past the edge by how far the finger is beyond it', () => {
    expect(edgePush({ x: 0, y: 0 }, 0.1, box)).toEqual({ x: 0, y: 0 })
    const p = edgePush({ x: 1.35, y: 0 }, 0.1, box)
    expect(p.x).toBeCloseTo(0.3)
    expect(p.y).toBe(0)
  })

  it('frames the view so the aim is drawn where it is shown', () => {
    // aim at (0.5, 0.5), shown at (0, 0), zoom 3: the viewBox is centred on the aim
    const vb = viewBoxFor({ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, 3, box.half)
    expect(vb.w).toBeCloseTo(2.3 / 3)
    expect(vb.x + vb.w / 2).toBeCloseTo(0.5)
    expect(vb.y + vb.w / 2).toBeCloseTo(0.5)
  })
})
