import { describe, it, expect } from 'vitest'
import { seeAllStats, tabOf, tileValue } from './modeStats'

describe('profile mode stats', () => {
  it('formats a tile by its kind', () => {
    expect(tileValue({ value: 7, format: 'int' })).toBe('7')
    expect(tileValue({ value: 61.234, format: 'decimal' })).toBe('61.2')
    expect(tileValue({ value: 0.625, format: 'percent' })).toBe('63%')
  })

  it('links to the Stats page only for your own X01', () => {
    expect(seeAllStats('x01', true, true)).toBe(true)
    expect(seeAllStats('x01', false, true)).toBe(false)
    expect(seeAllStats('x01', true, false)).toBe(false)
    expect(seeAllStats('cricket', true, true)).toBe(false)
  })

  it('reads the tab from the URL, the overview for none or an unknown one', () => {
    expect(tabOf('stats')).toBe('stats')
    expect(tabOf('achievements')).toBe('achievements')
    expect(tabOf(undefined)).toBe('overview')
    expect(tabOf('nope')).toBe('overview')
  })
})
