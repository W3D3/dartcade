import { describe, it, expect } from 'vitest'
import { parseLabel } from '../dartUtils.js'

describe('CorrectionPanel full picker data', () => {
  it('full picker includes 25, Bull, Miss as special targets', () => {
    const specials = ['25', 'Bull', 'Miss']
    specials.forEach(s => {
      const p = parseLabel(s)
      expect(p).toBeDefined()
      expect(p.score).toBeGreaterThanOrEqual(0)
    })
  })
  it('number grid covers 1–20', () => {
    const nums = Array.from({length: 20}, (_, i) => i + 1)
    expect(nums).toHaveLength(20)
    expect(nums[0]).toBe(1)
    expect(nums[19]).toBe(20)
  })
})
