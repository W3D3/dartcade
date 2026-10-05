import { describe, it, expect } from 'vitest'
import { dayMonth, initial, ordinal, pad2, plural } from '../fmt.js'

describe('fmt', () => {
  it('ordinal: st, nd, rd, and th for the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
      '111th',
    ])
  })
  it('plural, pad2, initial', () => {
    expect([plural(1, 'leg'), plural(3, 'leg'), plural(2, 'person', 'people')]).toEqual(['1 leg', '3 legs', '2 people'])
    expect(pad2(7)).toBe('07')
    expect([initial(' christoph'), initial('  ')]).toEqual(['C', '?'])
  })
  it('dayMonth: always 3-letter months (never "Sept")', () => {
    expect(dayMonth(new Date(2026, 8, 24))).toBe('24 Sep')
  })
})
