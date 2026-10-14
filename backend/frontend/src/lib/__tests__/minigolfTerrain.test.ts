import { describe, it, expect } from 'vitest'
import { capsule, contourSpacing, forceArrows, mesaLook, mesaRing, slopeLook } from '$lib/minigolf/terrain'
import type { Hole, Slope, Terrain } from '$shared/minigolf/types'

const summit: Slope = { radial: { center: [900, 600], radius: 400, strength: 1500 } }
const bump: Slope = { bump: { from: [1000, 2000], to: [1000, 2800], width: 300, strength: 250 } }

/** Every number in an SVG path (arcs' radii and flags included). */
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('minigolf terrain', () => {
  it('draws a circle around a point and a stadium around a ridge', () => {
    expect(capsule([0, 0], [0, 0], 50)).toBe('M -50 0 A 50 50 0 1 0 50 0 A 50 50 0 1 0 -50 0 Z')
    // Down one side of the ridge, round its far end, back up the other side, round its near end
    expect(capsule([0, 0], [0, 100], 10)).toBe('M 10 0 L 10 100 A 10 10 0 0 1 -10 100 L -10 0 A 10 10 0 0 1 10 0 Z')
  })

  it('rings a hill out to its edge, and no further', () => {
    const look = slopeLook(summit)
    const step = contourSpacing(1500)
    expect(look.contours).toHaveLength(Math.ceil(400 / step) - 1)
    for (const d of [...look.contours, ...look.bands]) expect(Math.max(...numbers(d).map(Math.abs))).toBeLessThanOrEqual(900 + 400)
    expect(look.raised).toBe(true)
  })

  it('shades a bowl dark, a hill and a bump light', () => {
    expect(slopeLook({ radial: { center: [900, 600], radius: 400, strength: -800 } }).raised).toBe(false)
    expect(slopeLook(bump).raised).toBe(true)
  })

  it('shades in bands narrowing towards the top, the widest one the slope itself', () => {
    const { bands } = slopeLook(bump)
    expect(bands[0]).toBe(capsule([1000, 2000], [1000, 2800], 300))
    expect(bands.length).toBeGreaterThan(5)
  })

  it('draws at least one contour on a gentle slope', () => {
    expect(slopeLook(bump).contours).toEqual([capsule([1000, 2000], [1000, 2800], 150)])
  })

  it('packs contours closer on steeper slopes', () => {
    expect(contourSpacing(1500)).toBeLessThan(contourSpacing(300))
  })

  it("rings a plateau out to each side's own edge, round its corners on ellipses", () => {
    // Top 1000..2000 x 500..800, a 600 mm ramp south, 60 mm cliffs elsewhere; from/to either way round
    const plateau: Terrain = { mesa: { from: [2000, 800], to: [1000, 500], height: 40, edges: [60, 60, 60, 600] } }
    expect(mesaRing(plateau, 0.5)).toBe(
      'M 1000 470 L 2000 470 A 30 30 0 0 1 2030 500 L 2030 800 A 30 300 0 0 1 2000 1100 L 1000 1100 A 30 300 0 0 1 970 800 L 970 500 A 30 30 0 0 1 1000 470 Z',
    )
    const look = mesaLook(plateau)
    expect(look.raised).toBe(true)
    expect(look.top).toBe(mesaRing(plateau, 0))
    expect(look.bands[0]).toBe(mesaRing(plateau, 1))
    expect(look.contours).toHaveLength(3)
    expect(mesaLook({ mesa: { ...plateau.mesa, height: -40 } }).raised).toBe(false)
  })

  it('points force arrows downhill, only on slopes and inside the course', () => {
    const hole: Hole = {
      id: 'h',
      name: 'H',
      par: 3,
      outline: [
        [0, 0],
        [1800, 0],
        [1800, 1200],
        [0, 1200],
      ],
      walls: [],
      bumpers: [],
      slopes: [summit],
      tee: [100, 1100],
      cup: { at: [900, 600], r: 54 },
    }
    const arrows = forceArrows(hole, 150)
    expect(arrows.length).toBeGreaterThan(4)
    for (const { at, end } of arrows) {
      // Within the hill, pointing away from its top
      expect(Math.hypot(at[0] - 900, at[1] - 600)).toBeLessThan(400)
      expect(Math.hypot(end[0] - 900, end[1] - 600)).toBeGreaterThan(Math.hypot(at[0] - 900, at[1] - 600))
    }
    expect(forceArrows({ ...hole, slopes: [] }, 150)).toEqual([])
  })
})
