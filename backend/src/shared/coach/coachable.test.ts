import { describe, it, expect } from 'vitest'
import { coachable } from './coachable.js'

const x01 = (config: Record<string, unknown>) => coachable('x01', config)

describe('coachable', () => {
  it('takes X01, straight in, double out, bull 25/50, singles', () => {
    expect(x01({ startScore: 501, inMode: 'straight', outMode: 'double', bullValue: '25_50', format: 'singles' })).toBe(true)
  })

  it('takes an old game whose config lacks the newer keys', () => {
    expect(x01({ startScore: 501 })).toBe(true)
  })

  it.each([
    ['straight out', { outMode: 'straight' }],
    ['master out', { outMode: 'master' }],
    ['double in', { inMode: 'double' }],
    ['bull 50/50', { bullValue: '50_50' }],
    ['teams', { format: 'teams' }],
  ])('leaves out %s', (_l, config) => {
    expect(x01(config)).toBe(false)
  })

  it('leaves out other modes', () => {
    expect(coachable('atc', {})).toBe(false)
  })
})
