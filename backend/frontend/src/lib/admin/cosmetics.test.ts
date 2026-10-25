import { describe, it, expect } from 'vitest'
import { cosmeticGroups, sourceOf } from './cosmetics'
import { PERKS, perk } from '$shared/progression.js'

describe('cosmeticGroups', () => {
  it('lists every cosmetic once, grouped by kind', () => {
    const groups = cosmeticGroups('')
    expect(groups.map(g => g.label)).toEqual([
      'Titles',
      'Banners',
      'Card colours',
      'Pictures',
      'Frames',
      'Name styles',
      'Sound packs',
      'Celebrations',
    ])
    expect(groups.flatMap(g => g.perks)).toHaveLength(PERKS.length)
    expect(groups.every(g => g.perks.every(p => p.kind === g.kind))).toBe(true)
  })

  it('filters by name, id, unlock or source', () => {
    const ids = (q: string) => cosmeticGroups(q).flatMap(g => g.perks.map(p => p.id))
    expect(ids('legend')).toContain('frame.legend')
    expect(ids('BANNER.NEON')).toEqual(['banner.neon'])
    expect(ids('throw a 180')).toEqual(['picture.electric'])
    expect(ids('not unlockable')).toHaveLength(10)
  })
})

describe('sourceOf', () => {
  it('says where a cosmetic comes from', () => {
    expect(sourceOf(perk('title.rookie')!)).toBe('Level track')
    expect(sourceOf(perk('title.fortnight')!)).toBe('Streak')
    expect(sourceOf(perk('colors.oche-red')!)).toBe('Ranked')
    expect(sourceOf(perk('picture.frost')!)).toBe('Not unlockable yet')
  })
})
