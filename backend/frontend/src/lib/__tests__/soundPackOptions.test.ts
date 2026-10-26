import { describe, expect, it } from 'vitest'
import { EACH_PACK, packOptions } from '../soundPacks.js'

const values = (o: { value: string }[]) => o.map(x => x.value)

describe('packOptions', () => {
  it('lists each-thrower and the dartcade default, even with nothing unlocked', () => {
    expect(packOptions([], false, null)).toEqual([
      { value: EACH_PACK, label: "Each thrower's own" },
      { value: 'sound.none', label: 'Dartcade default' },
    ])
  })

  it('adds unlocked packs and the one in use', () => {
    expect(values(packOptions(['sound.pub'], false, 'sound.legend'))).toEqual([EACH_PACK, 'sound.none', 'sound.pub', 'sound.legend'])
  })

  it('lists every pack with sounds.anyPack', () => {
    expect(values(packOptions([], true, null))).toEqual([
      EACH_PACK,
      'sound.none',
      'sound.pub',
      'sound.arcade',
      'sound.stadium',
      'sound.legend',
    ])
  })

  it('shows a saved default (sound.none) as the default entry', () => {
    expect(values(packOptions([], false, 'sound.none'))).toEqual([EACH_PACK, 'sound.none'])
  })
})
