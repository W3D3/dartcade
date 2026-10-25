import { describe, it, expect } from 'vitest'
import { TOP_LEVEL, TRACK, applyAllPlan, isWorn, levelTier, nextBigLevel, offTrack } from '../progress/track.js'
import { DEFAULT_EQUIPPED, PERKS, obtainable } from '$shared/progression.js'

describe('the rewards track', () => {
  it('has a level for every step to the top, each unlocking something', () => {
    expect(TOP_LEVEL).toBe(50)
    expect(TRACK.map(l => l.level)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    expect(TRACK.every(l => l.perks.length > 0)).toBe(true)
  })

  it('names a level by its rewards, a set by its title', () => {
    expect(TRACK[0]).toMatchObject({ label: 'Starter set', kinds: '4 rewards' })
    expect(TRACK[4]).toMatchObject({ label: 'Arcade + Pub green', kinds: 'Picture + Colours' })
    expect(TRACK[9]).toMatchObject({ label: 'Bronze frame + Bronze', kinds: 'Frame + Picture' })
    expect(TRACK[7]).toMatchObject({ label: 'Origami + Ice', kinds: 'Picture + Colours' })
    expect(TRACK[14]).toMatchObject({ label: 'Blueprint + Pub sounds', kinds: 'Picture + Sounds' })
    // Three rewards but no title: named by the rewards, not a set
    expect(TRACK[19]).toMatchObject({ label: 'Floodlights + Silver frame + Graffiti', kinds: 'Banner + Frame + Picture' })
    expect(TRACK[49]).toMatchObject({ label: 'Dartcade Legend', kinds: '8 rewards' })
  })

  it('marks every fifth, tenth and the top level', () => {
    expect([4, 5, 10, 15, 20, 50].map(levelTier)).toEqual([null, 'five', 'ten', 'five', 'ten', 'top'])
    expect([1, 5, 14, 49, 50].map(nextBigLevel)).toEqual([5, 10, 15, 50, 50])
  })

  it('puts every reward not earned by level off the track, grouped by how it is earned', () => {
    const off = offTrack([])
    expect(off.map(o => [o.name, o.when])).toEqual([
      ['Hot streak', '7-day streak'],
      ['Fortnight', '14-day streak'],
      ['Gold + Gold leaf', '30-day streak'],
      ['Never Misses', '100-day streak'],
      ['Crystal', 'Win 10 ranked games'],
      ['Oche red', 'Reach ranked Gold'],
    ])
    // Everything you can earn but the four level 1 "nothing" picks
    expect(TRACK.flatMap(l => l.perks).length + off.flatMap(o => o.perks).length).toBe(PERKS.filter(obtainable).length - 4)
  })

  it('lists a challenge reward only to whoever holds it', () => {
    expect(offTrack(['picture.electric']).map(o => o.when)).toContain('Throw a 180')
    expect(offTrack([]).map(o => o.when)).not.toContain('Throw a 180')
  })
})

describe('applying a reward', () => {
  const ten = TRACK[9].perks // Bronze frame + Bronze picture
  const frame = ten.find(p => p.kind === 'frame')!
  const picture = ten.find(p => p.kind === 'picture')!
  const plain = { equipped: DEFAULT_EQUIPPED, avatar: { kind: 'preset', foreground: 'classic', background: 'classic' } as const }

  it('counts a picture as worn only when both layers are its finish', () => {
    expect(isWorn(picture, plain)).toBe(false)
    expect(isWorn(picture, { ...plain, avatar: { kind: 'preset', foreground: 'bronze', background: 'classic' } })).toBe(false)
    expect(isWorn(picture, { ...plain, avatar: { kind: 'preset', foreground: 'bronze', background: 'bronze' } })).toBe(true)
    expect(isWorn(frame, { ...plain, equipped: { ...DEFAULT_EQUIPPED, frame: frame.id } })).toBe(true)
  })

  it('applies every unlocked item not worn yet, the picture on both layers', () => {
    const ids = ten.map(p => p.id)
    expect(applyAllPlan(ten, ids, plain)).toEqual({ equip: { frame: frame.id }, picture: 'bronze', empty: false })
    expect(applyAllPlan(ten, [frame.id], plain)).toEqual({ equip: { frame: frame.id }, picture: null, empty: false })
    expect(applyAllPlan(ten, [], plain).empty).toBe(true)
    const wearing = {
      equipped: { ...DEFAULT_EQUIPPED, frame: frame.id },
      avatar: { kind: 'preset', foreground: 'bronze', background: 'bronze' } as const,
    }
    expect(applyAllPlan(ten, ids, wearing)).toEqual({ equip: {}, picture: null, empty: true })
  })
})
