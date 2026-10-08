import { describe, it, expect } from 'vitest'
import { noStats, row, values } from './matchStats.js'

describe('matchStats helpers', () => {
  it('row() fills the defaults and keeps value/of only when given', () => {
    expect(row('average', '3-dart average', 'decimal', 'higher')).toEqual({
      key: 'average',
      label: '3-dart average',
      format: 'decimal',
      better: 'higher',
      compact: false,
    })
    expect(row('checkout', 'Checkout', 'ratio', 'higher', { compact: true, value: 'checkoutHits', of: 'checkoutAttempts' })).toEqual({
      key: 'checkout',
      label: 'Checkout',
      format: 'ratio',
      better: 'higher',
      compact: true,
      value: 'checkoutHits',
      of: 'checkoutAttempts',
    })
  })

  it('values() drops what does not apply', () => {
    expect(values({ a: 1, b: undefined, c: 0 })).toEqual({ a: 1, c: 0 })
  })

  it('noStats() is empty', () => {
    expect(noStats()).toEqual({ rows: [], seats: [] })
  })
})
