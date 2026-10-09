import { describe, it, expect } from 'vitest'
import { canShoot, finishShot, initBench, parseHole, placeBall, startShot, undoShot } from '$lib/minigolf/bench'
import { testCourse } from '$shared/minigolf/courses/test'

const hole = testCourse.holes[0]

describe('bench', () => {
  it('starts on the tee with no strokes', () => {
    expect(initBench(hole)).toMatchObject({ ball: hole.tee, strokes: 0, holed: false, rolling: false })
  })
  it('counts a stroke and moves the ball when the shot ends', () => {
    let s = startShot(initBench(hole))
    expect(s.strokes).toBe(1)
    expect(canShoot(s)).toBe(false) // still rolling: further clicks are ignored
    s = finishShot(s, { path: [hole.tee, [250, 1000]], rest: [250, 1000], holed: false })
    expect(s).toMatchObject({ ball: [250, 1000], rolling: false, history: [hole.tee] })
    expect(canShoot(s)).toBe(true)
  })
  it('counts a miss without moving the ball', () => {
    const s = finishShot(startShot(initBench(hole)), null)
    expect(s).toMatchObject({ ball: hole.tee, strokes: 1, rolling: false })
  })
  it('takes no more shots once holed', () => {
    const s = finishShot(startShot(initBench(hole)), { path: [hole.cup.at], rest: hole.cup.at, holed: true })
    expect(s.holed).toBe(true)
    expect(canShoot(s)).toBe(false)
  })
  it('undoes the last stroke', () => {
    let s = finishShot(startShot(initBench(hole)), { path: [], rest: [250, 1000], holed: false })
    s = finishShot(startShot(s), { path: [], rest: hole.cup.at, holed: true })
    s = undoShot(s)
    expect(s).toMatchObject({ ball: [250, 1000], strokes: 1, holed: false, history: [hole.tee] })
    expect(undoShot(undoShot(undoShot(s)))).toMatchObject({ ball: hole.tee, strokes: 0 })
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
})
