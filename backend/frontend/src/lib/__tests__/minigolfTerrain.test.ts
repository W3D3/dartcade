import { describe, it, expect } from 'vitest'
import { capsule, contourSpacing, slopeLook } from '$lib/minigolf/terrain'
import type { Slope } from '$shared/minigolf/types'

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
})
