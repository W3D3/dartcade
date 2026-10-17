import { describe, it, expect } from 'vitest'
import { groupRows } from './groupRows'

describe('groupRows', () => {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

  it('orders groups by compare and keeps the row order inside each group', () => {
    const rows = [
      { g: 'b', n: 3 },
      { g: 'a', n: 1 },
      { g: 'b', n: 1 },
      { g: 'a', n: 2 },
    ]
    expect(groupRows(rows, r => r.g, cmp)).toEqual([
      { group: 'a', rows: [rows[1], rows[3]] },
      { group: 'b', rows: [rows[0], rows[2]] },
    ])
  })

  it('returns no groups for no rows', () => {
    expect(groupRows([], () => 'x', cmp)).toEqual([])
  })
})
