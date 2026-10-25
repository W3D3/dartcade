import { describe, it, expect } from 'vitest'
import { AVATAR_FINISHES } from '$shared/avatarFinishes'
import { finishSprite } from '../assets/finishes.js'

const files = Object.keys(import.meta.glob('../assets/finishes/**/*'))
const ids = [...finishSprite.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
const refs = [...finishSprite.matchAll(/(?:url\(['"]?|href=")#([^'")]+)/g)].map(m => m[1])

describe('finish sprite', () => {
  it('has a foreground and a background svg for every finish, and no other files', () => {
    const expected = AVATAR_FINISHES.flatMap(f => [
      `../assets/finishes/${f.id}/background.svg`,
      `../assets/finishes/${f.id}/foreground.svg`,
    ])
    expect(files.sort()).toEqual(expected.sort())
  })

  it('holds a symbol for every layer of every finish', () => {
    for (const f of AVATAR_FINISHES) {
      expect(finishSprite).toContain(`<symbol id="finish-fg-${f.id}" viewBox="0 0 120 120">`)
      expect(finishSprite).toContain(`<symbol id="finish-bg-${f.id}" viewBox="0 0 120 120">`)
    }
  })

  it('defines no id twice, and every reference points at an id it defines', () => {
    expect(new Set(ids).size).toBe(ids.length)
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.filter(r => !ids.includes(r))).toEqual([])
  })
})
