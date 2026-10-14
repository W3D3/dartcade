import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  aimDial,
  aimLines,
  aimPreview,
  benchBall,
  canShoot,
  finishShot,
  initBench,
  parseHole,
  placeBall,
  playReplay,
  playShot,
  putt3d,
  startShot,
  undoShot,
  withHeight,
  type Pt3,
} from '$lib/minigolf/bench'
import { testCourse } from '$shared/minigolf/courses/test'
import { heightAt } from '$shared/minigolf/3d/ground'
import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
import { BALL_R, type PathPt } from '$shared/minigolf/types'

const hole = testCourse.holes[0]
const physics = DEFAULT_PHYSICS

describe('bench', () => {
  it('starts on the tee with no strokes', () => {
    expect(initBench(hole)).toMatchObject({ ball: hole.tee, strokes: 0, holed: false, rolling: false })
  })
  it('counts a stroke and moves the ball when the shot ends', () => {
    let s = startShot(initBench(hole))
    expect(s.strokes).toBe(1)
    expect(canShoot(s)).toBe(false) // still rolling: further clicks are ignored
    s = finishShot(s, { rest: [250, 1000], holed: false, path: [hole.tee, [250, 1000]] }, hole.tee)
    expect(s).toMatchObject({ ball: [250, 1000], rolling: false, history: [hole.tee] })
    expect(canShoot(s)).toBe(true)
  })
  it('counts a miss without moving the ball', () => {
    const s = finishShot(startShot(initBench(hole)), null, hole.tee)
    expect(s).toMatchObject({ ball: hole.tee, strokes: 1, rolling: false })
  })
  it('takes no more shots once holed', () => {
    const s = finishShot(startShot(initBench(hole)), { rest: hole.cup.at, holed: true, path: [hole.tee, hole.cup.at] }, hole.tee)
    expect(s.holed).toBe(true)
    expect(canShoot(s)).toBe(false)
  })
  it('draws the ball on the felt, and a holed one where its 3D path left it in the cup', () => {
    expect(benchBall(initBench(hole), hole)).toEqual([...hole.tee, heightAt(hole, hole.tee) + BALL_R])
    const sunk: PathPt = [hole.cup.at[0] + 3, hole.cup.at[1] - 2, -60]
    const s = finishShot(
      startShot(initBench(hole)),
      { rest: [sunk[0], sunk[1]], holed: true, path: [[...hole.tee, BALL_R], sunk] },
      hole.tee,
    )
    expect(benchBall(s, hole)).toEqual(sunk)
  })
  it('undoes the last stroke', () => {
    let s = finishShot(startShot(initBench(hole)), { rest: [250, 1000], holed: false, path: [hole.tee, [250, 1000]] }, hole.tee)
    s = finishShot(startShot(s), { rest: hole.cup.at, holed: true, path: [[250, 1000], hole.cup.at] }, [250, 1000])
    s = undoShot(s)
    expect(s).toMatchObject({ ball: [250, 1000], strokes: 1, holed: false, history: [hole.tee] })
    expect(undoShot(undoShot(undoShot(s)))).toMatchObject({ ball: hole.tee, strokes: 0 })
  })
  it('keeps the shot as lastShot, cleared by a miss, undo or placing', () => {
    const path: PathPt[] = [hole.tee, [250, 1000]]
    const s = finishShot(startShot(initBench(hole)), { rest: [250, 1000], holed: false, path }, hole.tee)
    expect(s.lastShot).toEqual({ from: hole.tee, path })
    expect(finishShot(startShot(s), null, s.ball).lastShot).toBeNull()
    expect(undoShot(s).lastShot).toBeNull()
    expect(placeBall(s, [100, 100]).lastShot).toBeNull()
    expect(initBench(hole).lastShot).toBeNull()
  })
  it('has nothing in bench.ts that a replay could use to change strokes or the ball', () => {
    // Replaying reads lastShot.path alone; nothing in bench.ts takes it as input, so a replay can't mutate the state
    const path: PathPt[] = [hole.tee, [250, 1000]]
    const s = finishShot(startShot(initBench(hole)), { rest: [250, 1000], holed: false, path }, hole.tee)
    expect(s.lastShot?.path).toBe(path)
    expect(s).toMatchObject({ strokes: 1, ball: [250, 1000] })
  })
  it('does not undo while the ball rolls', () => {
    const s = startShot(initBench(hole))
    expect(undoShot(s)).toBe(s)
  })
  it('places the ball anywhere without a stroke', () => {
    const s = placeBall(initBench(hole), [100, 100])
    expect(s).toMatchObject({ ball: [100, 100], strokes: 0, holed: false })
  })
  it('parses an edited hole', () => {
    expect(parseHole(JSON.stringify(hole))).toEqual({ hole })
    const { walls: _w, bumpers: _b, slopes: _s, ...bare } = hole
    expect(parseHole(JSON.stringify(bare))).toEqual({ hole: { ...bare, walls: [], bumpers: [], slopes: [] } })
  })
  it('reports bad JSON, missing keys, wrong shapes and invalid holes', () => {
    expect(parseHole('{')).toMatchObject({ errors: [expect.stringMatching(/^invalid JSON/)] })
    expect(parseHole('[]')).toMatchObject({ errors: [expect.stringMatching(/^hole:/)] })
    expect(parseHole('{"id":"x"}')).toMatchObject({
      errors: expect.arrayContaining([expect.stringMatching(/^tee:/), expect.stringMatching(/^cup:/)]),
    })
    expect(parseHole(JSON.stringify({ ...hole, outline: 5 }))).toMatchObject({ errors: [expect.stringMatching(/^outline:/)] })
    expect(parseHole(JSON.stringify({ ...hole, tee: [9999, 9999] }))).toEqual({ errors: ['tee is outside the outline'] })
  })

  it("fills in a path point's height from the ground, keeping one it already has", () => {
    expect(withHeight(hole, [hole.tee[0], hole.tee[1], -40])).toEqual([hole.tee[0], hole.tee[1], -40])
    expect(withHeight(hole, [hole.tee[0], hole.tee[1]])).toEqual([hole.tee[0], hole.tee[1], heightAt(hole, hole.tee) + BALL_R])
  })

  it('dials the aim rings around the ball, and nothing while rolling or holed', () => {
    const s = initBench(hole)
    const dial = aimDial(s, physics)
    expect(dial?.at).toEqual(hole.tee)
    expect(dial?.treble).toBeGreaterThan(0)
    expect(dial!.double).toBeGreaterThan(dial!.treble)
    expect(aimDial(startShot(s), physics)).toBeNull()
    const holed = finishShot(startShot(s), { rest: hole.cup.at, holed: true, path: [hole.tee, hole.cup.at] }, hole.tee)
    expect(aimDial(holed, physics)).toBeNull()
  })

  it('previews the putt the pointer would make, and none while not hovering, rolling or holed', () => {
    const s = initBench(hole)
    expect(aimPreview(s, hole, physics, null, true)).toBeNull()
    const preview = aimPreview(s, hole, physics, { x: 0, y: 0.5 }, true)
    expect(preview).toMatchObject({ from: hole.tee })
    expect(preview!.roll).toBeGreaterThan(0)
    expect(aimPreview(startShot(s), hole, physics, { x: 0, y: 0.5 }, true)).toBeNull()
  })

  it('turns a preview into a bright aim line, or none without one', () => {
    expect(aimLines(null)).toEqual([])
    const preview = aimPreview(initBench(hole), hole, physics, { x: 0, y: 0.5 }, true)!
    expect(aimLines(preview)).toEqual([{ ...preview, current: true }])
  })

  it('misses without simulating anything for coords off the board, or none', async () => {
    await expect(putt3d(hole, physics, hole.tee, { x: 2, y: 2 }, true)).resolves.toBeNull()
    await expect(putt3d(hole, physics, hole.tee, null, true)).resolves.toBeNull()
  })
})

describe('playShot and playReplay', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('plays a 3D path frame by frame, from its start to its end', async () => {
    const path: Pt3[] = [
      [0, 0, 21],
      [10, 10, 21],
      [20, 20, 21],
    ]
    let t = performance.now() - 25
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((t += 20)), 0))
    const seen: Array<[Pt3, number]> = []
    await playShot(path, (ball, chase) => seen.push([ball, chase.at]), false)
    expect(seen[0][0]).toEqual(path[0])
    expect(seen.at(-1)![0]).toEqual(path.at(-1))
    expect(seen.every(([, at]) => at >= 0)).toBe(true)
  })

  it('replays a stored path in real time, the same way', async () => {
    const path: Pt3[] = [
      [0, 0, 21],
      [10, 10, 21],
    ]
    let t = performance.now() - 25
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((t += 20)), 0))
    const seen: Pt3[] = []
    await playReplay(path, ball => seen.push(ball), false)
    expect(seen[0]).toEqual(path[0])
    expect(seen.at(-1)).toEqual(path.at(-1))
  })
})
