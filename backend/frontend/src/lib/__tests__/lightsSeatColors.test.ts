import { describe, expect, it } from 'vitest'
import { DEFAULT_SEAT_COLORS } from '$shared/lights/index.js'
import { SEAT_PALETTE, colorName, isDefaultSeatColors } from '$lib/lights/seatColors'

describe('seat colours view', () => {
  it('the palette starts with the six built-in colours, in seat order, and has no duplicates', () => {
    expect(SEAT_PALETTE.slice(0, DEFAULT_SEAT_COLORS.length).map(c => c.hex)).toEqual([...DEFAULT_SEAT_COLORS])
    expect(new Set(SEAT_PALETTE.map(c => c.hex)).size).toBe(SEAT_PALETTE.length)
  })
  it('names a palette colour, in any case, and falls back to the hex', () => {
    expect(colorName('#FF5A1F')).toBe('orange')
    expect(colorName('#123ABC')).toBe('#123abc')
  })
  it('knows the built-in colours, so Reset has nothing to do', () => {
    expect(isDefaultSeatColors([...DEFAULT_SEAT_COLORS])).toBe(true)
    expect(isDefaultSeatColors(DEFAULT_SEAT_COLORS.map(c => c.toUpperCase()))).toBe(true)
    expect(isDefaultSeatColors(['#ff0000', ...DEFAULT_SEAT_COLORS.slice(1)])).toBe(false)
    expect(isDefaultSeatColors(DEFAULT_SEAT_COLORS.slice(0, 5))).toBe(false)
  })
})
