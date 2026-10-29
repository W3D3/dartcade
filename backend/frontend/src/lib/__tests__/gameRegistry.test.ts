// Every playable mode on the Play page is a game the SPA has a name, rules line and tables for.
import { describe, it, expect } from 'vitest'
import { GAME_MODES } from '../gameModes'
import { GAME_NAMES } from '$shared/gameNames'
import { getGameView } from '../gameViews'

describe('game registry', () => {
  it('lists exactly the named games as playable', () => {
    const playable = GAME_MODES.filter(m => m.available).map(m => m.id)
    expect(playable.sort()).toEqual(Object.keys(GAME_NAMES).sort())
  })

  it('gives an unknown mode a neutral title', () => {
    expect(getGameView('atc').title).toBe('Around the Clock')
    expect(getGameView('atc').shortTitle).toBe('ATC')
    expect(getGameView('soccer').title).toBe('Game')
  })
})
