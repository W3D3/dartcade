import { describe, expect, it } from 'vitest'
import { render } from 'svelte/server'
import ToolRail from '$lib/components/minigolf/editor/ToolRail.svelte'
import Properties from '$lib/components/minigolf/editor/Properties.svelte'
import CheckList from '$lib/components/minigolf/editor/CheckList.svelte'
import ElementList from '$lib/components/minigolf/editor/ElementList.svelte'
import {
  addBumper,
  addRadial,
  addPlateau,
  addWall,
  dragTo,
  hitTest,
  setRadialHeight,
  updateBumper,
  updateSlope,
  updateTerrain,
  updateWall,
} from '$lib/minigolf/editor/ops'
import { addCircle, curveEdge, openHole } from '$lib/minigolf/editor/shapeOps'
import { DEFAULT_OPTIONS, type Tool } from '$lib/minigolf/editor/tools'
import { holeChecks, type ElementRef } from '$shared/minigolf/checks'
import { testCourse } from '$shared/minigolf/courses/test'
import type { Hole } from '$shared/minigolf/types'

const hole1 = testCourse.holes[0] as Hole // test-straight: [0,0]-[500,0]-[500,3000]-[0,3000]
const noop = () => {}
const ok = (r: ReturnType<typeof addCircle>): Hole => {
  if (!r.ok) throw new Error(r.reason)
  return r.hole
}
// The lane opening into a round green round the cup
const keyhole = ok(addCircle(hole1, [250, 300], 450))

describe('hitTest', () => {
  const h = addRadial(addWall(addBumper(hole1, [250, 1500], 'M', 'normal'), [100, 1000], [400, 1000], 'normal'), [250, 2000], 300, 80)
  it('finds a bumper under the pointer', () => {
    expect(hitTest(h, [270, 1510])).toEqual({ kind: 'bumper', index: 0 })
  })
  it('finds a wall within its thickness and a tolerance', () => {
    expect(hitTest(h, [200, 1015])).toEqual({ kind: 'wall', index: 0 })
  })
  it('finds the tee and the cup before the ground under them', () => {
    expect(hitTest(h, h.tee)).toEqual({ kind: 'tee', index: 0 })
    expect(hitTest(h, h.cup.at)).toEqual({ kind: 'cup', index: 0 })
  })
  it('finds a terrain shape when nothing is on top of it', () => {
    expect(hitTest(h, [250, 2150])).toEqual({ kind: 'slope', index: 0 })
    const p = addPlateau(hole1, [100, 1100], [400, 1400], 100, 'S')
    expect(hitTest(p, [250, 1200])).toEqual({ kind: 'terrain', index: 0 })
  })
  it('looks through what stands on the ground for Flatten', () => {
    const covered = addBumper(h, [250, 2000], 'M', 'normal')
    expect(hitTest(covered, [250, 2000])).toEqual({ kind: 'bumper', index: 1 })
    expect(hitTest(covered, [250, 2000], 20, true)).toEqual({ kind: 'slope', index: 0 })
  })
  it('finds nothing on plain felt', () => {
    expect(hitTest(h, [450, 600])).toBeNull()
  })
})

describe('dragTo', () => {
  const grid = { threshold: 10, grid: true }
  it('is a no-op for a click without movement (corner, tee or cup alike)', () => {
    // An off-grid corner at an odd angle stays exactly where it is
    expect(dragTo([123, 457], [130, 460], [130, 460], { ...grid, angle45From: [0, 0] })).toBeNull()
    expect(dragTo([123, 457], [130, 460], [135, 463], grid)).toBeNull()
  })
  it('moves an off-centre grab by the pointer travel, not to the pointer', () => {
    expect(dragTo([300, 1750], [340, 1790], [440, 1690], grid)).toEqual([400, 1650])
  })
  it('snaps a corner to 45° only once it actually moves', () => {
    const opts = { ...grid, angle45From: [0, 0] as const }
    expect(dragTo([500, 210], [500, 210], [503, 212], opts)).toBeNull()
    const p = dragTo([500, 210], [500, 210], [520, 230], opts)!
    expect(Math.abs(Math.atan2(p[1], p[0]) % (Math.PI / 4))).toBeLessThan(0.15) // 45° step, then the 50 mm grid
    expect(p[0] % 50).toBe(0)
    expect(p[1] % 50).toBe(0)
  })
  it('turns a move into a delta from [0, 0], snapped to the grid', () => {
    expect(dragTo([0, 0], [250, 1500], [310, 1540], grid)).toEqual([50, 50])
  })
})

describe('update ops', () => {
  it('changes one bumper and leaves the hole alone', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    const next = updateBumper(h, 0, { r: 80 })
    expect(next.bumpers[0]).toEqual({ ...h.bumpers[0], r: 80 })
    expect(h.bumpers[0].r).toBe(60)
  })
  it('changes a wall, a slope and a terrain shape by index', () => {
    const h = addPlateau(addRadial(addWall(hole1, [0, 0], [100, 0], 'thin'), [250, 2000], 300, 80), [100, 100], [400, 400], 100, 'S')
    expect(updateWall(h, 0, { thickness: 20 }).walls[0].thickness).toBe(20)
    expect(updateSlope(h, 0, { radial: { center: [1, 2], radius: 3, strength: 4 } }).slopes[0]).toEqual({
      radial: { center: [1, 2], radius: 3, strength: 4 },
    })
    const mesa = { ...h.terrain![0].mesa, height: 50 }
    expect(updateTerrain(h, 0, { mesa }).terrain![0].mesa.height).toBe(50)
  })
})

describe('setRadialHeight', () => {
  const strength = (h: Hole) => (h.slopes[0] && 'radial' in h.slopes[0] ? h.slopes[0].radial.strength : NaN)
  it("sets a hill's height and a dip's depth, keeping which it is", () => {
    expect(strength(setRadialHeight(addRadial(hole1, [250, 1500], 300, 50), 0, 80))).toBeGreaterThan(0)
    expect(strength(setRadialHeight(addRadial(hole1, [250, 1500], 300, -50), 0, 80))).toBeLessThan(0)
  })
  it('keeps a dip a dip through a depth of 0 and back', () => {
    const dip = addRadial(hole1, [250, 1500], 300, -50)
    const zero = setRadialHeight(dip, 0, 0)
    expect(strength(setRadialHeight(zero, 0, 30))).toBeLessThan(0)
  })
})

describe('ToolRail', () => {
  it('lists the eight tools with their keys and marks the active one', () => {
    const { body } = render(ToolRail, { props: { tool: 'wall', ontool: noop } })
    for (const [label, key] of [
      ['Select', 'V'],
      ['Outline', 'O'],
      ['Circle', 'I'],
      ['Tee', 'T'],
      ['Cup', 'C'],
      ['Bumper', 'B'],
      ['Wall', 'W'],
      ['Terrain', 'R'],
    ]) {
      expect(body).toContain(`aria-label="${label} (${key})"`)
      expect(body).toContain(`<kbd`)
    }
    expect(body).toMatch(/aria-label="Wall \(W\)"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Wall \(W\)"/)
  })
})

describe('Properties', () => {
  const props = (over: { tool?: Tool; selection?: ElementRef }) => ({
    hole: addBumper(hole1, [250, 1500], 'L', 'strong'),
    tool: 'select' as Tool,
    selection: null as ElementRef | null,
    options: { ...DEFAULT_OPTIONS },
    onedit: noop,
    onshape: noop,
    oncurve: noop,
    onduplicate: noop,
    ondelete: noop,
    ...over,
  })
  it("shows a selected bumper's position, size and bounce, with Duplicate and Delete", () => {
    const { body } = render(Properties, { props: props({ selection: { kind: 'bumper', index: 0 } }) })
    expect(body).toContain('Bumper 1')
    expect(body).toContain('value="250"')
    expect(body).toContain('value="1500"')
    expect(body).toMatch(/aria-checked="true"[^>]*>(?:<!--[^>]*-->)*L/)
    expect(body).toMatch(/aria-checked="true"[^>]*>(?:<!--[^>]*-->)*Strong/)
    expect(body).toContain('Duplicate')
    expect(body).toContain('Delete')
  })
  it("shows a selected circle's centre and radius", () => {
    const { body } = render(Properties, { props: { ...props({ selection: { kind: 'circle', index: 0 } }), hole: keyhole } })
    expect(body).toContain('Circle')
    expect(body).toContain('value="250"')
    expect(body).toContain('value="300"')
    expect(body).toContain('Radius (mm)')
    expect(body).toContain('value="450"')
    expect(body).toContain('Delete')
  })
  it('offers to curve a selected straight edge, and to straighten a curved one', () => {
    const edge = { tool: 'outline' as Tool, selection: { kind: 'edge', index: 1 } as ElementRef }
    const straight = render(Properties, { props: props(edge) }).body
    expect(straight).toContain('Edge 2')
    expect(straight).toMatch(/>\s*Curve\s*</)
    const curved = render(Properties, { props: { ...props(edge), hole: ok(curveEdge(hole1, 1)) } }).body
    expect(curved).toMatch(/>\s*Straighten\s*</)
  })
  it("shows the bumper tool's size and bounce for placing", () => {
    const { body } = render(Properties, { props: props({ tool: 'bumper' }) })
    expect(body).toContain('Size')
    expect(body).toContain('Bounce')
    expect(body).toMatch(/aria-checked="true"[^>]*>(?:<!--[^>]*-->)*M/)
    expect(body).not.toContain('Duplicate')
  })
})

describe('CheckList and ElementList', () => {
  it('shows why an edit was refused', () => {
    const { body } = render(CheckList, { props: { checks: [], refused: 'The circle must overlap the course', onselect: noop } })
    expect(body).toContain('The circle must overlap the course')
    expect(body).not.toContain('No problems')
  })
  it('says so when a hole loads with a shape its outline no longer matches, and one undo brings it back', () => {
    const changed: Hole = { ...keyhole, outline: hole1.outline }
    const { hole, history, dropped } = openHole(changed)
    expect(hole.shape).toBeUndefined()
    const { body } = render(CheckList, { props: { checks: [], shapeDropped: dropped, onselect: noop } })
    expect(body).toContain("This hole's circles were changed elsewhere and are now plain corners.")
    expect(history.undo()).toEqual(changed)
    expect(history.canUndo).toBe(false)
  })
  it('opens a hole whose shape still matches with nothing to undo', () => {
    const { hole, history, dropped } = openHole(keyhole)
    expect([hole, dropped, history.canUndo]).toEqual([keyhole, false, false])
  })
  it('lists circles with their radius', () => {
    const { body } = render(ElementList, { props: { hole: keyhole, selection: null, onselect: noop } })
    expect(body).toContain('Circle 1')
    expect(body).toContain('r 450 mm')
    expect(body).toContain('4 corners')
  })
  it('shows the outline error for a crossing outline', () => {
    const crossed: Hole = {
      ...hole1,
      outline: [
        [0, 0],
        [500, 3000],
        [500, 0],
        [0, 3000],
      ],
    }
    const { body } = render(CheckList, { props: { checks: holeChecks(crossed), onselect: noop } })
    expect(body).toContain('Outline crosses itself')
  })
  it('says so when every check passes', () => {
    const { body } = render(CheckList, { props: { checks: [], onselect: noop } })
    expect(body).toContain('No problems')
  })
  it('lists the outline, tee, cup and every element', () => {
    const h = addBumper(hole1, [250, 1500], 'M', 'normal')
    const { body } = render(ElementList, { props: { hole: h, selection: { kind: 'bumper', index: 0 }, onselect: noop } })
    expect(body).toContain('Outline')
    expect(body).toContain('4 corners')
    expect(body).toContain('Tee')
    expect(body).toContain('Cup')
    expect(body).toContain('Bumper 1')
  })
})
