import { describe, expect, it } from 'vitest'
import { findMatches, matchFirstTo, rangeOf, type Entry } from './matcher.js'

const entry = (id: string, rating: number, since = 0, more: Partial<Entry> = {}): Entry => ({
  id,
  mode: '1v1',
  userIds: [id],
  rating,
  firstTo: 2,
  since,
  ...more,
})
const ids = (pairs: [Entry, Entry][]) => pairs.map(([a, b]) => [a.id, b.id])

describe('rangeOf', () => {
  it('starts at ±75 and widens by 75 every 30 s, up to 600', () => {
    expect(rangeOf({ since: 0 }, 0)).toBe(75)
    expect(rangeOf({ since: 0 }, 29_999)).toBe(75)
    expect(rangeOf({ since: 0 }, 30_000)).toBe(150)
    expect(rangeOf({ since: 0 }, 95_000)).toBe(300)
    expect(rangeOf({ since: 0 }, 60 * 60_000)).toBe(600)
  })
})

describe('findMatches', () => {
  it('pairs searches within both ranges', () => {
    expect(ids(findMatches([entry('a', 1200), entry('b', 1270)], 0))).toEqual([['a', 'b']])
    expect(findMatches([entry('a', 1200), entry('b', 1280)], 0)).toEqual([])
  })

  it('uses the narrower range of the two', () => {
    // a has searched for a minute (±225), b just started (±75)
    expect(findMatches([entry('a', 1200, 0), entry('b', 1300, 60_000)], 60_000)).toEqual([])
    expect(ids(findMatches([entry('a', 1200, 0), entry('b', 1300, 30_000)], 60_000))).toEqual([['a', 'b']])
  })

  it('lets the longest search take the closest rating', () => {
    const pairs = findMatches([entry('c', 1250, 20), entry('a', 1200, 0), entry('b', 1210, 10)], 30)
    expect(ids(pairs)).toEqual([['a', 'b']])
  })

  it('keeps modes apart and never pairs a player with themselves', () => {
    expect(findMatches([entry('a', 1200), entry('b', 1200, 0, { mode: '2v2', userIds: ['b', 'c'] })], 0)).toEqual([])
    expect(
      findMatches(
        [entry('a', 1200, 0, { mode: '2v2', userIds: ['a', 'x'] }), entry('b', 1200, 0, { mode: '2v2', userIds: ['x', 'y'] })],
        0,
      ),
    ).toEqual([])
  })

  it('puts every search in one pair at most', () => {
    const pairs = findMatches([entry('a', 1200), entry('b', 1200), entry('c', 1200), entry('d', 1200)], 0)
    expect(pairs).toHaveLength(2)
    expect(new Set(pairs.flat().map(e => e.id)).size).toBe(4)
  })
})

describe('matchFirstTo', () => {
  it('plays First to 3 only when both picked it', () => {
    expect(matchFirstTo({ firstTo: 3 }, { firstTo: 3 })).toBe(3)
    expect(matchFirstTo({ firstTo: 3 }, { firstTo: 2 })).toBe(2)
  })
})
