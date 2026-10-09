import { describe, it, expect } from 'vitest'
import { canShoot, finishShot, initBench, startShot } from '$lib/minigolf/bench'
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
})
