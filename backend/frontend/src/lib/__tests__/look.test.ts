import { describe, it, expect } from 'vitest'
import { accentOf, bannerStyle, cardColors, titleName } from '../progress/look.js'

describe('look', () => {
  it('reads card colours by perk id, falling back to Dartcade', () => {
    expect(cardColors('colors.night')).toEqual({ bg: '#14202e', fg: '#9ec8ff' })
    expect(cardColors('colors.gone')).toEqual({ bg: '#181a16', fg: '#c6f24e' })
  })
  it('tints banners with the card colours; gold keeps its own', () => {
    const c = cardColors('colors.night')
    expect(bannerStyle('banner.plain', c)).toBe('background: color-mix(in srgb, #9ec8ff 10%, #1f221c)')
    expect(bannerStyle('banner.chalk', c)).toContain('repeating-linear-gradient')
    expect(bannerStyle('banner.gold', c)).toContain('#6a5518')
  })
  it("takes the pair's light tone as the accent on the dark card", () => {
    expect(accentOf(cardColors('colors.night'))).toBe('#9ec8ff')
    expect(accentOf(cardColors('colors.paper'))).toBe('#e9dfc4')
  })
  it('names the title', () => {
    expect(titleName({ title: 'title.oche-regular' })).toBe('Oche Regular')
    expect(titleName({ title: 'title.gone' })).toBe('Rookie')
  })
})
