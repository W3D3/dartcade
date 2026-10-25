import { describe, it, expect } from 'vitest'
import { OFF_TRACK, TOP_LEVEL, TRACK, applyAllPlan, isWorn, levelTier, nextBigLevel } from '../progress/track.js'
import { DEFAULT_EQUIPPED, PERKS } from '$shared/progression.js'

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
    expect(TRACK[14]).toMatchObject({ label: 'Pub sounds', kinds: 'Sounds' })
    expect(TRACK[49]).toMatchObject({ label: 'Dartcade Legend', kinds: '8 rewards' })
  })

  it('marks every fifth, tenth and the top level', () => {
    expect([4, 5, 10, 15, 20, 50].map(levelTier)).toEqual([null, 'five', 'ten', 'five', 'ten', 'top'])
    expect([1, 5, 14, 49, 50].map(nextBigLevel)).toEqual([5, 10, 15, 50, 50])
  })

  it('puts every reward not earned by level off the track, grouped by how it is earned', () => {
    expect(OFF_TRACK.map(o => [o.name, o.when])).toEqual([
      ['Hot streak', '7-day streak'],
      ['Fortnight', '14-day streak'],
      ['Gold + Gold leaf', '30-day streak'],
      ['Never Misses', '100-day streak'],
      ['Crystal', 'Win 10 ranked games'],
      ['Oche red', 'Reach ranked Gold'],
      ['Frost', 'Check out 100+'],
      ['Carbon', 'Play 100 games'],
      ['Holo', 'Season 1 reward'],
      ['Marble', 'Win 25 ranked games'],
      ['Lava', 'Win 5 in a row'],
      ['Electric', 'Throw a 180'],
      ['Galaxy', 'Reach Elite rank'],
      ['Toxic', 'Minigolf hole in one'],
      ['Walnut', 'Play 20 games with friends'],
      ['Glitch', 'Launch week event'],
    ])
    // Everything but the four level 1 "nothing" picks
    expect(TRACK.flatMap(l => l.perks).length + OFF_TRACK.flatMap(o => o.perks).length).toBe(PERKS.length - 4)
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
