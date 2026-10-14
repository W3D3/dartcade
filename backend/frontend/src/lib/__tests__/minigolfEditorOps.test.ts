import { describe, expect, it } from 'vitest'
import {
  addBumper,
  addCorner,
  addRadial,
  addPlateau,
  addRidge,
  addWall,
  duplicateElement,
  elementsOf,
  moveCorner,
  moveCup,
  moveElement,
  moveTee,
  removeCorner,
  removeElement,
  setCupSize,
  snap,
} from '$lib/minigolf/editor/ops'
import { createHistory } from '$lib/minigolf/editor/history'
import { holeChecks } from '$shared/minigolf/checks'
import { G } from '$shared/minigolf/3d/ground'
import { testCourse } from '$shared/minigolf/courses/test'
import type { Hole } from '$shared/minigolf/types'

const hole1 = testCourse.holes[0] as Hole // test-straight: [0,0]-[500,0]-[500,3000]-[0,3000]

describe('snap', () => {
  it('snaps to the 50 mm grid', () => {
    expect(snap([123, 178], { grid: true })).toEqual([100, 200])
  })

  it('leaves a point alone with no grid and no anchor', () => {
    expect(snap([123, 178], { grid: false })).toEqual([123, 178])
  })

  it('snaps the direction from an anchor to the nearest 45°, keeping distance', () => {
    const anchor: [number, number] = [0, 0]
    const dist = 100
    const at30 = [dist * Math.cos(Math.PI / 6), dist * Math.sin(Math.PI / 6)] as const
    const [x, y] = snap(at30, { grid: false, angle45From: anchor })
    expect(Math.hypot(x, y)).toBeCloseTo(dist, 6)
    expect(Math.atan2(y, x)).toBeCloseTo(Math.PI / 4, 6)
  })

  it('snaps angle first, then the grid', () => {
    const anchor: [number, number] = [0, 0]
    const at30 = [100 * Math.cos(Math.PI / 6), 100 * Math.sin(Math.PI / 6)] as const
    const [x, y] = snap(at30, { grid: true, angle45From: anchor })
    expect(x % 50).toBe(0)
    expect(y % 50).toBe(0)
  })
})

describe('corners', () => {
  it('moves a corner', () => {
    const h = moveCorner(hole1, 0, [10, 20])
    expect(h.outline[0]).toEqual([10, 20])
    expect(h.outline.slice(1)).toEqual(hole1.outline.slice(1))
  })

  it("adds a corner at an edge's middle", () => {
    const h = addCorner(hole1, 0)
    expect(h.outline).toEqual([
      [0, 0],
      [250, 0],
      [500, 0],
      [500, 3000],
      [0, 3000],
    ])
  })

  it('adds a corner on the closing edge (after the last index)', () => {
    const h = addCorner(hole1, hole1.outline.length - 1)
    expect(h.outline.at(-1)).toEqual([0, 1500])
  })

  it('removes a corner', () => {
    const h = addCorner(hole1, 0) // 5 corners now
    const back = removeCorner(h, 1)
    expect(back.outline).toEqual(hole1.outline)
  })

  it('refuses to remove a corner below 3', () => {
    const triangle: Hole = {
      ...hole1,
      outline: [
        [0, 0],
        [500, 0],
        [0, 500],
      ],
    }
    expect(removeCorner(triangle, 0)).toBe(triangle)
  })

  it('allows a corner dragged across another edge; holeChecks then reports the outline error', () => {
    // Drags the top-right corner down past the far (bottom) edge: outline edges now cross (a bowtie)
    const crossed = moveCorner(hole1, 1, [100, 3100])
    const errors = holeChecks(crossed).filter(c => c.level === 'error')
    expect(errors.some(c => c.element?.kind === 'outline' && c.message.includes('crosses itself'))).toBe(true)
  })
})

describe('tee and cup', () => {
  it('moves the tee', () => {
    expect(moveTee(hole1, [111, 222]).tee).toEqual([111, 222])
  })

  it('moves the cup', () => {
    const h = moveCup(hole1, [111, 222])
    expect(h.cup.at).toEqual([111, 222])
    expect(h.cup.r).toBe(hole1.cup.r)
  })

  it('sets the cup size from the presets', () => {
    expect(setCupSize(hole1, 'standard').cup.r).toBe(80)
    expect(setCupSize(hole1, 'beginner').cup.r).toBe(110)
  })
})

describe('bumper', () => {
  it('adds a bumper with the size and bounce presets', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    expect(h.bumpers).toHaveLength(1)
    expect(h.bumpers[0]).toEqual({ at: [250, 1500], r: 60, restitution: 0.85 })
  })
})

describe('wall', () => {
  it('adds a wall with the thickness preset', () => {
    const h = addWall(hole1, [100, 100], [400, 100], 'thin')
    expect(h.walls).toHaveLength(1)
    expect(h.walls[0]).toEqual({
      points: [
        [100, 100],
        [400, 100],
      ],
      thickness: 12,
    })
  })
})

describe('terrain shapes', () => {
  it('adds a hill with strength = height * G / radius', () => {
    const h = addRadial(hole1, [250, 1500], 400, 58)
    expect(h.slopes).toHaveLength(1)
    expect(h.slopes[0]).toEqual({ radial: { center: [250, 1500], radius: 400, strength: (58 * G) / 400 } })
  })

  it('adds a dip with a negative strength', () => {
    const h = addRadial(hole1, [250, 1500], 400, -30)
    expect(h.slopes[0]).toEqual({ radial: { center: [250, 1500], radius: 400, strength: -(30 * G) / 400 } })
  })

  it('adds a ridge with strength = height * G / width', () => {
    const h = addRidge(hole1, [100, 1000], [100, 2000], 300, 40)
    expect(h.slopes[0]).toEqual({ bump: { from: [100, 1000], to: [100, 2000], width: 300, strength: (40 * G) / 300 } })
  })

  it("adds a plateau with the ramp side's edge 600 mm and the others 60 mm", () => {
    const h = addPlateau(hole1, [100, 500], [400, 1500], 80, 'S')
    expect(h.terrain).toEqual([{ mesa: { from: [100, 500], to: [400, 1500], height: 80, edges: [60, 60, 60, 600] } }])
  })

  it('places the ramp edge per direction (N top, E right, S bottom, W left)', () => {
    expect(addPlateau(hole1, [0, 0], [1, 1], 10, 'N').terrain![0].mesa.edges).toEqual([60, 600, 60, 60])
    expect(addPlateau(hole1, [0, 0], [1, 1], 10, 'E').terrain![0].mesa.edges).toEqual([60, 60, 600, 60])
    expect(addPlateau(hole1, [0, 0], [1, 1], 10, 'W').terrain![0].mesa.edges).toEqual([600, 60, 60, 60])
  })
})

describe('move/remove/duplicate by ref', () => {
  it('moves a bumper', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    const moved = moveElement(h, { kind: 'bumper', index: 0 }, [10, -10])
    expect(moved.bumpers[0].at).toEqual([260, 1490])
  })

  it('moves a wall (every point)', () => {
    const h = addWall(hole1, [100, 100], [400, 100], 'thin')
    const moved = moveElement(h, { kind: 'wall', index: 0 }, [5, 5])
    expect(moved.walls[0].points).toEqual([
      [105, 105],
      [405, 105],
    ])
  })

  it('moves a slope (radial center, or both bump ends)', () => {
    const hill = addRadial(hole1, [250, 1500], 400, 58)
    const movedHill = moveElement(hill, { kind: 'slope', index: 0 }, [1, 2])
    expect(movedHill.slopes[0]).toMatchObject({ radial: { center: [251, 1502] } })

    const ridge = addRidge(hole1, [100, 1000], [100, 2000], 300, 40)
    const movedRidge = moveElement(ridge, { kind: 'slope', index: 0 }, [1, 2])
    expect(movedRidge.slopes[0]).toMatchObject({ bump: { from: [101, 1002], to: [101, 2002] } })
  })

  it('moves terrain (both corners)', () => {
    const h = addPlateau(hole1, [100, 500], [400, 1500], 80, 'S')
    const moved = moveElement(h, { kind: 'terrain', index: 0 }, [1, 1])
    expect(moved.terrain![0].mesa).toMatchObject({ from: [101, 501], to: [401, 1501] })
  })

  it('moves the tee and cup, and an outline corner, by ref', () => {
    expect(moveElement(hole1, { kind: 'tee', index: 0 }, [1, 1]).tee).toEqual([hole1.tee[0] + 1, hole1.tee[1] + 1])
    expect(moveElement(hole1, { kind: 'cup', index: 0 }, [1, 1]).cup.at).toEqual([hole1.cup.at[0] + 1, hole1.cup.at[1] + 1])
    expect(moveElement(hole1, { kind: 'outline', index: 0 }, [1, 1]).outline[0]).toEqual([hole1.outline[0][0] + 1, hole1.outline[0][1] + 1])
  })

  it('removes a bumper, wall, slope and terrain shape', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    expect(removeElement(h, { kind: 'bumper', index: 0 }).bumpers).toEqual([])

    const w = addWall(hole1, [100, 100], [400, 100], 'thin')
    expect(removeElement(w, { kind: 'wall', index: 0 }).walls).toEqual([])

    const s = addRadial(hole1, [250, 1500], 400, 58)
    expect(removeElement(s, { kind: 'slope', index: 0 }).slopes).toEqual([])

    const t = addPlateau(hole1, [100, 500], [400, 1500], 80, 'S')
    expect(removeElement(t, { kind: 'terrain', index: 0 }).terrain).toEqual([])
  })

  it('refuses to remove the tee or cup', () => {
    expect(removeElement(hole1, { kind: 'tee', index: 0 })).toBe(hole1)
    expect(removeElement(hole1, { kind: 'cup', index: 0 })).toBe(hole1)
  })

  it('removes an outline corner by ref', () => {
    const h = addCorner(hole1, 0) // 5 corners
    expect(removeElement(h, { kind: 'outline', index: 1 }).outline).toEqual(hole1.outline)
  })

  it('duplicates a bumper, wall, slope and terrain shape, offset', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    const dup = duplicateElement(h, { kind: 'bumper', index: 0 }, [20, 20])
    expect(dup.bumpers).toHaveLength(2)
    expect(dup.bumpers[1]).toEqual({ at: [270, 1520], r: 60, restitution: 0.85 })

    const w = addWall(hole1, [100, 100], [400, 100], 'thin')
    const dupW = duplicateElement(w, { kind: 'wall', index: 0 }, [0, 50])
    expect(dupW.walls[1].points).toEqual([
      [100, 150],
      [400, 150],
    ])

    const s = addRadial(hole1, [250, 1500], 400, 58)
    const dupS = duplicateElement(s, { kind: 'slope', index: 0 }, [10, 10])
    expect(dupS.slopes).toHaveLength(2)
    expect(dupS.slopes[1]).toMatchObject({ radial: { center: [260, 1510] } })

    const t = addPlateau(hole1, [100, 500], [400, 1500], 80, 'S')
    const dupT = duplicateElement(t, { kind: 'terrain', index: 0 }, [10, 10])
    expect(dupT.terrain).toHaveLength(2)
    expect(dupT.terrain![1].mesa).toMatchObject({ from: [110, 510], to: [410, 1510] })
  })

  it('does not duplicate the outline, tee or cup', () => {
    expect(duplicateElement(hole1, { kind: 'outline', index: 0 }, [1, 1])).toBe(hole1)
    expect(duplicateElement(hole1, { kind: 'tee', index: 0 }, [1, 1])).toBe(hole1)
    expect(duplicateElement(hole1, { kind: 'cup', index: 0 }, [1, 1])).toBe(hole1)
  })
})

describe('elementsOf', () => {
  it('labels a bumper with its size and bounce', () => {
    const h = addBumper(addBumper(hole1, [250, 1500], 'S', 'soft'), [250, 2000], 'M', 'normal')
    const items = elementsOf(h)
    expect(items[0]).toMatchObject({ ref: { kind: 'bumper', index: 0 }, label: 'Bumper 1', detail: 'S · soft' })
    expect(items[1]).toMatchObject({ ref: { kind: 'bumper', index: 1 }, label: 'Bumper 2', detail: 'M · normal' })
  })

  it('shows a radius that matches no preset as a raw number', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    const odd: Hole = { ...h, bumpers: [{ ...h.bumpers[0], r: 55 }] }
    expect(elementsOf(odd)[0].detail).toBe('r 55 mm · normal')
  })

  it('labels a wall with its thickness', () => {
    const h = addWall(hole1, [100, 100], [400, 100], 'thin')
    expect(elementsOf(h)[0]).toMatchObject({ ref: { kind: 'wall', index: 0 }, label: 'Wall 1', detail: 'thin' })
  })

  it('labels a hill, dip, and ridge by their height', () => {
    const hill = addRadial(hole1, [250, 1500], 400, 58)
    expect(elementsOf(hill)[0]).toMatchObject({ label: 'Hill', detail: '58 mm' })

    const dip = addRadial(hole1, [250, 1500], 400, -30)
    expect(elementsOf(dip)[0]).toMatchObject({ label: 'Dip', detail: '30 mm' })

    const ridge = addRidge(hole1, [100, 1000], [100, 2000], 300, 40)
    expect(elementsOf(ridge)[0]).toMatchObject({ label: 'Ridge', detail: '40 mm' })
  })

  it('labels a plateau by its ramp side', () => {
    const h = addPlateau(hole1, [100, 500], [400, 1500], 80, 'S')
    expect(elementsOf(h)[0]).toMatchObject({ ref: { kind: 'terrain', index: 0 }, label: 'Plateau', detail: 'ramp south' })
  })
})

describe('history', () => {
  it('undoes and redoes through push', () => {
    const h = createHistory(hole1)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)

    const afterMove = moveTee(hole1, [1, 1])
    h.push(afterMove)
    expect(h.canUndo).toBe(true)

    const afterMove2 = moveTee(afterMove, [2, 2])
    h.push(afterMove2)

    expect(h.undo()).toEqual(afterMove)
    expect(h.canRedo).toBe(true)
    expect(h.undo()).toEqual(hole1)
    expect(h.canUndo).toBe(false)
    expect(h.undo()).toBeNull()

    expect(h.redo()).toEqual(afterMove)
    expect(h.redo()).toEqual(afterMove2)
    expect(h.canRedo).toBe(false)
    expect(h.redo()).toBeNull()
  })

  it('drops the redo branch on a push after an undo', () => {
    const h = createHistory(hole1)
    h.push(moveTee(hole1, [1, 1]))
    h.push(moveTee(hole1, [2, 2]))
    h.undo()
    expect(h.canRedo).toBe(true)
    h.push(moveTee(hole1, [3, 3]))
    expect(h.canRedo).toBe(false)
    expect(h.redo()).toBeNull()
  })

  it('bounds undo history to the limit', () => {
    const h = createHistory(hole1, 3)
    for (let i = 1; i <= 5; i++) h.push(moveTee(hole1, [i, i]))
    expect(h.undo()).toEqual(moveTee(hole1, [4, 4]))
    expect(h.undo()).toEqual(moveTee(hole1, [3, 3]))
    expect(h.undo()).toEqual(moveTee(hole1, [2, 2]))
    expect(h.canUndo).toBe(false)
    expect(h.undo()).toBeNull()
  })
})
