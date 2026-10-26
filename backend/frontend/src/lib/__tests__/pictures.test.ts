import { describe, it, expect } from 'vitest'
import { finishAvatar, picturePerk, pictureUnlock, shownFinishes, splitBasics } from '../progress/pictures.js'
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

  it('leaves out the challenge finishes nothing unlocks yet, unless you hold or wear one', () => {
    expect(shownFinishes([])).toHaveLength(AVATAR_FINISHES.length - 10)
    expect(shownFinishes([]).map(f => f.id)).not.toContain('frost')
    expect(shownFinishes(['frost']).map(f => f.id)).toContain('frost')
    expect(shownFinishes(['frost'])).toHaveLength(AVATAR_FINISHES.length - 9)
  })

  it('splits the basics from the finishes, Classic among the basics', () => {
    const { basics, finishes } = splitBasics(shownFinishes([]))
    expect(basics.map(f => f.id)).toEqual(['classic', 'white', 'red', 'sky', 'amber', 'pink', 'violet', 'mint', 'paper'])
    expect(finishes[0].id).toBe('chalk')
    expect(finishes.map(f => f.id)).not.toContain('classic')
    expect(basics.length + finishes.length).toBe(shownFinishes([]).length)
  })
})
