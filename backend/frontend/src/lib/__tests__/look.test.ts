import { describe, it, expect } from 'vitest'
import { BANNERS, accentOf, bannerClass, bannerStyle, cardColors, colorsClass, titleName } from '../progress/look.js'
import { PERKS } from '$shared/progression.js'

describe('look', () => {
  it('reads card colours by perk id, falling back to Dartcade', () => {
    expect(cardColors('colors.ice')).toEqual({ bg: '#15262e', fg: '#bfeaf5' })
    expect(cardColors('colors.gone')).toEqual({ bg: '#181a16', fg: '#c6f24e' })
  })
  it('tints banners with the card colours; gold keeps its own', () => {
    const c = cardColors('colors.ice')
    expect(bannerStyle('banner.plain', c)).toBe('background: color-mix(in srgb, #bfeaf5 10%, #1f221c); --cos-accent: #bfeaf5')
    expect(bannerStyle('banner.chalk-scribbles', c)).toContain('repeating-linear-gradient')
    expect(bannerStyle('banner.gold', c)).toContain('#6a5518')
    expect(bannerStyle('banner.retired', c)).toBe(bannerStyle('banner.plain', c))
  })
  it('draws every banner in the catalogue, and animates the animated ones', () => {
    for (const p of PERKS.filter(x => x.kind === 'banner')) {
      expect(BANNERS[p.id], p.id).toBeDefined()
      expect(bannerClass(p.id) !== '', p.id).toBe(p.animated === true)
    }
  })
  it('lays the holographic sheen over its card only', () => {
    expect(colorsClass('colors.holo')).toBe('cos-holo')
    expect(colorsClass('colors.ice')).toBe('')
  })
  it("takes the pair's light tone as the accent on the dark card", () => {
    expect(accentOf(cardColors('colors.ice'))).toBe('#bfeaf5')
    expect(accentOf(cardColors('colors.chalk-dust'))).toBe('#e8e6dc')
  })
  it('names the title', () => {
    expect(titleName({ title: 'title.oche-regular' })).toBe('Oche Regular')
    expect(titleName({ title: 'title.gone' })).toBe('Rookie')
  })
})
