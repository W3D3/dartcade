// The safety net for a ball that falls through the ground: no ground has a gap, so this file
// cuts one (in its own file, as the mock holds for the whole file).
import { it, expect, vi } from 'vitest'
import { DEFAULT_PHYSICS as P } from '../physics.js'
import type { Hole } from '../types.js'

vi.mock('./ground.js', async importOriginal => {
  const ground = await importOriginal<typeof import('./ground.js')>()
  return {
    ...ground,
    // No ground across the lane from y = 1500 to 2000 (and as far as the triangles there reach)
    groundMesh: (hole: Hole) => {
      const { positions, indices } = ground.groundMesh(hole)
      const kept = [...indices].filter((_, k, all) => {
        const ys = [0, 1, 2].map(n => positions[all[k - (k % 3) + n] * 3 + 2])
        return Math.max(...ys) <= 1500 || Math.min(...ys) >= 2000
      })
      return { positions, indices: Uint32Array.from(kept) }
    },
  }
})

const lane: Hole = {
  id: 'lane',
  name: 'Lane',
  par: 2,
  outline: [
    [0, 0],
    [400, 0],
    [400, 4000],
    [0, 4000],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [200, 3800],
  cup: { at: [200, 300], r: 80 },
}

it('puts a ball that falls through the ground back where it was putted from', async () => {
  vi.resetModules() // the setup file loaded physics3d with the real ground
  const { initPhysics3d, simulateShot3d } = await import('./physics3d.js')
  await initPhysics3d()
  // It would stop in the gap, on the course: it falls till it's a cup's depth under the ground
  const r = simulateShot3d(lane, P, [200, 3000], { dir: [0, -1], power: 1200 / P.maxRoll })
  expect(Math.min(...r.path.map(p => p[2]!))).toBeLessThan(-100)
  expect(r.rest).toEqual([200, 3000])
  expect(r.holed).toBe(false)
})
