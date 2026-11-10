import { describe, it, expect } from 'vitest'
import { visitTier } from './darts.js'

describe('visitTier', () => {
  it('bands a visit at its edges', () => {
    expect([0, 99, 100, 139, 140, 179, 180].map(visitTier)).toEqual([null, null, 'ton', 'ton', '140', '140', 'max'])
  })
})
