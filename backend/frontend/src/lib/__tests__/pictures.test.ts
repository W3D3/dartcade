import { describe, it, expect } from 'vitest'
import { picturePerk, pictureUnlock, presetIn } from '../progress/pictures.js'
import { AVATAR_PRESET_ART } from '../avatarPresetIcons.js'
import { AVATAR_PRESETS } from '$shared/avatarPresets.js'

describe('profile pictures', () => {
  it('keeps your colours when you pick another picture, the defaults without any', () => {
    expect(presetIn({ kind: 'preset', preset: 'logo', color: '#2d6cdf', fgColor: '#ffffff' }, 'trophy')).toEqual({
      kind: 'preset',
      preset: 'trophy',
      color: '#2d6cdf',
      fgColor: '#ffffff',
    })
    expect(presetIn({ kind: 'none' }, 'dart')).toEqual({ kind: 'preset', preset: 'dart', color: '#808080', fgColor: '#000000' })
  })

  it('has an icon and a reward for every preset', () => {
    for (const p of AVATAR_PRESETS) {
      expect(AVATAR_PRESET_ART[p.id], p.id).toBeDefined()
      expect(picturePerk(p.id), p.id).toBeDefined()
    }
    expect(pictureUnlock('trophy')).toBe('Level 25')
    expect(pictureUnlock('flame')).toBe('7-day streak')
  })
})
