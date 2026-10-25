import { describe, it, expect } from 'vitest'
import { finishAvatar, picturePerk, pictureUnlock } from '../progress/pictures.js'
import { AVATAR_FINISHES } from '$shared/avatarFinishes.js'

describe('profile pictures', () => {
  it('shows a picture reward as its finish on both layers', () => {
    expect(finishAvatar('gold')).toEqual({ kind: 'preset', foreground: 'gold', background: 'gold' })
  })

  it('has a reward for every finish, with what unlocks it', () => {
    for (const f of AVATAR_FINISHES) expect(picturePerk(f.id), f.id).toBeDefined()
    expect(pictureUnlock('chrome')).toBe('Level 25')
    expect(pictureUnlock('hot-streak')).toBe('7-day streak')
    expect(pictureUnlock('electric')).toBe('Throw a 180')
  })
})
