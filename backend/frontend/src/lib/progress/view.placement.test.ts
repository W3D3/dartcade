import { describe, expect, it } from 'vitest'
import { FREEZE_EVERY, MAX_FREEZES } from '$shared/progression.js'
import { freezeHelp, freezeLeftLine, nextFreezeDay, placementMark } from './view'

describe('placementMark', () => {
  it('reads W and L for a duel, not 2nd', () => {
    expect(placementMark(1, 2)).toMatchObject({ text: 'W', won: true })
    expect(placementMark(2, 2)).toMatchObject({ text: 'L', title: 'Lost', won: false })
  })
  it('keeps the place with three or more players, and a dash alone', () => {
    expect(placementMark(1, 4).text).toBe('W')
    expect(placementMark(2, 4).text).toBe('2nd')
    expect(placementMark(1, 1)).toMatchObject({ text: '–', won: false })
  })
})

describe('freeze copy', () => {
  it('takes its numbers from the shared constants', () => {
    expect(freezeHelp(1, 3).join(' ')).toContain(`${MAX_FREEZES} freezes`)
    expect(freezeHelp(1, 3).join(' ')).toContain(`every ${FREEZE_EVERY} streak days`)
  })
  it('names the next freeze day above the streak', () => {
    expect(nextFreezeDay(0)).toBe(FREEZE_EVERY)
    expect(nextFreezeDay(FREEZE_EVERY)).toBe(FREEZE_EVERY * 2)
    expect(freezeLeftLine(0, 8)).toBe(`0 left, next at day ${FREEZE_EVERY * 2}`)
  })
  it('names no day while the player holds the most', () => {
    expect(freezeHelp(MAX_FREEZES, 14).join(' ')).not.toMatch(/is next/)
    expect(freezeLeftLine(MAX_FREEZES, 14)).toBe(`${MAX_FREEZES} left, the most you can hold`)
  })
})
