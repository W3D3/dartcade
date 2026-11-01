import { describe, expect, it } from 'vitest'
import { placementMark } from './view'

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
