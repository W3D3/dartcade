import { describe, it, expect } from 'vitest'
import { holeChecks } from './checks.js'
import { testCourse } from './courses/test.js'
import type { Hole } from './types.js'

const base: Hole = {
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

describe('holeChecks', () => {
  it('finds no errors for a valid test-course hole', () => {
    expect(holeChecks(testCourse.holes[0]).filter(c => c.level === 'error')).toEqual([])
  })

  it('reports a crossing outline as an error on the outline', () => {
    const hole: Hole = {
      ...base,
      outline: [
        [0, 0],
        [400, 1200],
        [400, 0],
        [0, 1200],
      ],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'error',
      message: 'outline crosses itself',
      element: { kind: 'outline', index: 0 },
    })
  })

  it('warns when the cup is close to the rail', () => {
    const hole: Hole = { ...base, cup: { at: [10, 150], r: 54 } }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Cup is close to the rail',
      element: { kind: 'cup', index: 0 },
    })
  })

  it('warns when a bumper is close to the rail', () => {
    const hole: Hole = { ...base, bumpers: [{ at: [60, 600], r: 40 }] }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Bumper is close to the rail',
      element: { kind: 'bumper', index: 0 },
    })
  })

  it('warns when the tee is on a wall', () => {
    const hole: Hole = {
      ...base,
      walls: [
        {
          points: [
            [200, 1050],
            [200, 1150],
          ],
        },
      ],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Tee is on a wall',
      element: { kind: 'tee', index: 0 },
    })
  })

  it('warns when a hill reaches past the outline', () => {
    const hole: Hole = { ...base, slopes: [{ radial: { center: [50, 600], radius: 100, strength: 500 } }] }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Terrain reaches past the outline',
      element: { kind: 'slope', index: 0 },
    })
  })

  it('warns when the cup is close to an interior wall', () => {
    const hole: Hole = {
      ...base,
      cup: { at: [200, 600], r: 54 },
      walls: [
        {
          points: [
            [200, 630],
            [350, 630],
          ],
        },
      ],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Cup is close to a wall',
      element: { kind: 'cup', index: 0 },
    })
  })

  it('warns when a ridge pokes past the outline', () => {
    const hole: Hole = {
      ...base,
      slopes: [{ bump: { from: [100, 600], to: [300, 600], width: 1300, strength: 500 } }],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Terrain reaches past the outline',
      element: { kind: 'slope', index: 0 },
    })
  })

  it('does not warn when a ridge stays inside the outline', () => {
    const hole: Hole = {
      ...base,
      slopes: [{ bump: { from: [100, 600], to: [300, 600], width: 100, strength: 500 } }],
    }
    expect(holeChecks(hole).filter(c => c.element?.kind === 'slope')).toEqual([])
  })

  it('warns when a mesa corner pokes past the outline', () => {
    const hole: Hole = {
      ...base,
      terrain: [{ mesa: { from: [350, 50], to: [450, 150], height: 100, edges: [50, 50, 50, 50] } }],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Terrain reaches past the outline',
      element: { kind: 'terrain', index: 0 },
    })
  })

  it('warns when a ridge falls away past the outline beside it', () => {
    // 300 wide: the ground still slopes 300 mm either side of x = 200, past the rail at x = 0
    const hole: Hole = { ...base, slopes: [{ bump: { from: [200, 500], to: [200, 700], width: 300, strength: 500 } }] }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Terrain reaches past the outline',
      element: { kind: 'slope', index: 0 },
    })
  })

  it("warns when a plateau's ramp runs past the outline", () => {
    // A 600 mm ramp south of y = 900 ends at y = 1500, past the rail at y = 1200
    const hole: Hole = {
      ...base,
      terrain: [{ mesa: { from: [100, 700], to: [300, 900], height: 100, edges: [50, 50, 50, 600] } }],
    }
    expect(holeChecks(hole)).toContainEqual({
      level: 'warning',
      message: 'Terrain reaches past the outline',
      element: { kind: 'terrain', index: 0 },
    })
  })

  it('does not warn when a mesa stays inside the outline', () => {
    const hole: Hole = {
      ...base,
      terrain: [{ mesa: { from: [50, 50], to: [150, 150], height: 100, edges: [50, 50, 50, 50] } }],
    }
    expect(holeChecks(hole).filter(c => c.element?.kind === 'terrain')).toEqual([])
  })
})
