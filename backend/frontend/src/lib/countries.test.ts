import { describe, expect, it } from 'vitest'
import { COUNTRY_CODES } from '$shared/countries.js'
import { COUNTRY_OPTIONS, countryName, flagUrl } from './countries'

describe('countries', () => {
  it('has a flag and a name for every country the API accepts', () => {
    expect(COUNTRY_CODES.filter(c => !flagUrl(c))).toEqual([])
    expect(COUNTRY_OPTIONS).toHaveLength(COUNTRY_CODES.length)
    expect(countryName('AT')).toBe('Austria')
  })
  it('lists the countries by name', () => {
    const names = COUNTRY_OPTIONS.map(o => o.label)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  })
})
