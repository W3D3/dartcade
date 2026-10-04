import { describe, it, expect } from 'vitest'
import { matchLayout, NARROW_MATCH_QUERY } from '../matchLayout.js'
import { matchesAt } from './fixtures/widthQuery.js'

describe('matchLayout', () => {
  it('uses the phone layout on a phone for any player count', () => {
    expect([1, 2, 3, 6].map(n => matchLayout(n, true))).toEqual(['phone', 'phone', 'phone', 'phone'])
  })
  it('keeps the desktop layouts otherwise', () => {
    expect([1, 2, 3, 6].map(n => matchLayout(n, false))).toEqual(['solo', 'duel', 'party', 'party'])
  })
})

describe('matchLayout with teams', () => {
  it('a team game has its own desktop layout; phones keep the phone layout', () => {
    expect(matchLayout(4, false, true)).toBe('teams')
    expect(matchLayout(3, false, true)).toBe('teams')
    expect(matchLayout(4, true, true)).toBe('phone')
  })
})

describe('two players on a narrow screen', () => {
  it('fit a panel each side of the board from 1024 px wide', () => {
    // `narrow` is NARROW_MATCH_QUERY (isNarrowMatch) at that width
    expect([820, 1023, 1024, 1180, 1440].map(w => matchesAt(NARROW_MATCH_QUERY, w))).toEqual([true, true, false, false, false])
  })
  it('stack as rows, like three or more, where the panels and the board do not fit', () => {
    expect(matchLayout(2, false, false, true)).toBe('party')
    expect(matchLayout(2, false, false, false)).toBe('duel')
    expect(matchLayout(1, false, false, true)).toBe('solo')
    expect(matchLayout(4, false, true, true)).toBe('teams')
    expect(matchLayout(2, true, false, true)).toBe('phone')
  })
})
