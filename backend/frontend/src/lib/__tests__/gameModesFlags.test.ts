import { describe, it, expect } from 'vitest'
import { GAME_MODES, listedMode, visibleModes } from '$lib/gameModes'

describe('visibleModes', () => {
  it('hides a mode whose flag is off, keeps modes without a flag', () => {
    const ids = (on: boolean) => visibleModes(GAME_MODES, () => on).map(m => m.id)
    expect(ids(false)).not.toContain('minigolf')
    expect(ids(false)).toEqual(expect.arrayContaining(['atc', 'x01']))
    expect(ids(true)).toContain('minigolf')
  })
})

describe('listedMode', () => {
  it("keeps a saved mode the backend lists, and falls back from one it doesn't (Minigolf without its flag)", () => {
    const games = [{ id: 'atc' }, { id: 'x01' }]
    expect(listedMode('x01', games)).toBe('x01')
    expect(listedMode('minigolf', games)).toBe('atc')
  })
})
