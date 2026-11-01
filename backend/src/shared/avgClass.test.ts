import { describe, expect, it } from 'vitest'
import { avgClass } from './avgClass.js'
import { COUNTRY_CODES, isCountryCode } from './countries.js'

describe('avgClass', () => {
  it('floors to the 5-point class between 20 and 100', () => {
    expect([20, 24.9, 25, 53.1, 89.99, 99.9, 100, 134.2].map(avgClass)).toEqual([20, 20, 25, 50, 85, 95, 100, 100])
  })
  it('has no class without an average or under 20', () => {
    expect([null, 19.9, 0, NaN].map(avgClass)).toEqual([null, null, null, null])
  })
})

describe('countries', () => {
  it('lists each ISO code once and accepts nothing else', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
    expect(COUNTRY_CODES).toHaveLength(249)
    expect(COUNTRY_CODES.every(c => /^[A-Z]{2}$/.test(c))).toBe(true)
    expect(isCountryCode('AT')).toBe(true)
    expect(['XX', 'at', 'UK', ''].some(isCountryCode)).toBe(false)
  })
})
