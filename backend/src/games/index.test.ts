import { describe, it, expect } from 'vitest'
import { supportsBots } from './index.js'

describe('supportsBots', () => {
  it('is true for x01: its module defines botTarget', () => {
    expect(supportsBots('x01')).toBe(true)
  })

  it('is false for atc: it has no botTarget (bots stay x01-only until atc gets one)', () => {
    expect(supportsBots('atc')).toBe(false)
  })

  it('is false for an unknown or unpicked game id', () => {
    expect(supportsBots('nonsense')).toBe(false)
    expect(supportsBots('')).toBe(false)
  })
})
