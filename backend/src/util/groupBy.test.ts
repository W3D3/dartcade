import { describe, it, expect } from 'vitest'
import { groupBy } from './groupBy.js'

describe('groupBy', () => {
  it('groups items by key, keeping their order within and the first-seen order of keys', () => {
    const rows = [
      { s: 'b', seat: 0 },
      { s: 'a', seat: 0 },
      { s: 'b', seat: 1 },
      { s: 'a', seat: 1 },
    ]
    const groups = groupBy(rows, r => r.s)
    expect([...groups.keys()]).toEqual(['b', 'a'])
    expect(groups.get('a')?.map(r => r.seat)).toEqual([0, 1])
    expect(groups.get('b')?.map(r => r.seat)).toEqual([0, 1])
  })

  it('gives an empty map for no items', () => {
    expect(groupBy([], () => 'x').size).toBe(0)
  })
})
