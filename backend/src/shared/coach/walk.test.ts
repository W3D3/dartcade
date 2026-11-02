import { describe, it, expect } from 'vitest'
import { fin } from './model.js'
import { throwsOf } from './walk.js'
import { leg, visit } from './testLegs.js'

describe('throwsOf', () => {
  it('gives the score before each dart and the darts left', () => {
    const t = throwsOf([leg([visit(0, 501, ['T20', 'T20', 'S20'])])], 0, 501)
    expect(t.map(x => [x.left, x.darts])).toEqual([
      [501, 3],
      [441, 2],
      [381, 1],
    ])
    expect(t.every(x => x.start === 501)).toBe(true)
  })

  it('rebuilds a busting visit from its start, not from what was left after it', () => {
    // 40 left: S20 (20), S19 busts. The game stores remaining 40, scored 0.
    const t = throwsOf([leg([visit(0, 40, ['S20', 'S19'])])], 0, 501)
    expect(t.map(x => [x.left, x.bust])).toEqual([
      [40, false],
      [20, true],
    ])
  })

  it('stops at the busting dart: the darts after it score nothing', () => {
    // 32 left: T20 busts; the game keeps the S16 and D8 thrown after it
    const v = visit(0, 32, ['T20', 'S16', 'D8'])
    expect(v).toMatchObject({ remaining: 32, scored: 0, bust: true })
    expect(v.darts).toHaveLength(3)
    expect(throwsOf([leg([v])], 0, 501).map(x => [x.d.segment.name, x.left, x.bust])).toEqual([['T20', 32, true]])
  })

  it('marks the dart that checks out', () => {
    const t = throwsOf([leg([visit(0, 40, ['D20'])])], 0, 501)
    expect(t[0].checkout).toBe(true)
  })

  it("only walks the chosen seat, with w from the opponent's score", () => {
    const l = leg([visit(1, 501, ['T20']), visit(1, 32, []), visit(0, 97, ['S20', 'S20', 'S20'])])
    // The opponent's last visit left them on 32 (the empty visit stands for "they are on 32")
    const t = throwsOf([l], 0, 501)
    expect(t).toHaveLength(3)
    expect(t[0].w).toBeCloseTo(1 - fin[32][3], 10)
  })

  it('gives w = 1 solo and before the opponent has thrown', () => {
    expect(throwsOf([leg([visit(0, 501, ['S20'])])], 0, 501)[0].w).toBe(1)
    // The opponent hasn't thrown in this leg yet: still on 501, no finish
    const t = throwsOf([leg([visit(0, 501, ['S20']), visit(1, 501, ['S20'])])], 0, 501)
    expect(t[0].w).toBe(1)
  })

  it("is empty for a seat that didn't throw", () => {
    expect(throwsOf([leg([visit(1, 501, ['T20'])])], 0, 501)).toEqual([])
  })
})
