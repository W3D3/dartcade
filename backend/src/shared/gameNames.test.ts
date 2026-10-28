import { describe, it, expect } from 'vitest'
import { gameList } from '../games/index.js'
import { GAME_NAMES, gameTitle } from './gameNames.js'

describe('game names', () => {
  it('names every registered game module, and nothing else', () => {
    expect(Object.keys(GAME_NAMES).sort()).toEqual(gameList.map(g => g.id).sort())
  })

  it('falls back to the id for a mode this build does not know', () => {
    expect(gameTitle('atc')).toBe('Around the Clock')
    expect(gameTitle('cricket')).toBe('cricket')
  })
})
