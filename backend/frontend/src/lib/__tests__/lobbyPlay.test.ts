import { describe, it, expect } from 'vitest'
import { boardToApply, chosenGame, lobbyPath, playAction } from '../lobby/play.js'

describe('playAction', () => {
  it('no lobby: create one', () => {
    expect(playAction(null)).toBe('create')
  })

  it('your own lobby: continue in it', () => {
    expect(playAction({ youHost: true })).toBe('continue')
  })

  it("someone else's lobby: open it", () => {
    expect(playAction({ youHost: false })).toBe('open')
  })
})

describe('lobbyPath', () => {
  it('the lobby page, carrying the board from "Play on this board"', () => {
    expect(lobbyPath(null)).toBe('/lobby')
    expect(lobbyPath('b 1')).toBe('/lobby?board=b%201')
  })
})

describe('boardToApply', () => {
  const boards = [
    { id: 'b1', name: 'Garage' },
    { id: 'b2', name: 'Kitchen' },
  ]

  it('moves you to one of your boards', () => {
    expect(boardToApply('b2', 'b1', boards)).toBe('b2')
    expect(boardToApply('b2', null, boards)).toBe('b2')
  })

  it("nothing when there's no board, you're on it already, or it isn't yours", () => {
    expect(boardToApply(null, 'b1', boards)).toBeNull()
    expect(boardToApply('b1', 'b1', boards)).toBeNull()
    expect(boardToApply('b9', 'b1', boards)).toBeNull()
  })
})

describe('chosenGame', () => {
  const games = [{ id: 'atc' }, { id: 'x01' }]

  it("carries the x01 form's botSpeed through, alongside its other fields", () => {
    const config = {
      startScore: 301,
      inMode: 'straight',
      outMode: 'double',
      bullOff: 'off',
      bullValue: '25_50',
      maxRounds: 50,
      firstTo: 3,
      botSpeed: 'fast',
      // Not in the x01 whitelist: must not leak into the saved config
      format: 'singles',
    }
    expect(chosenGame(games, 'x01', config)).toEqual({
      gameId: 'x01',
      config: {
        startScore: 301,
        inMode: 'straight',
        outMode: 'double',
        bullOff: 'off',
        bullValue: '25_50',
        maxRounds: 50,
        firstTo: 3,
        botSpeed: 'fast',
      },
    })
  })

  it("doesn't carry botSpeed for atc, which has no bots", () => {
    const config = { finishOn: 'twenty', order: 'asc', multiplierAdvances: true, throwAgainOnAllHit: false, botSpeed: 'fast' }
    const picked = chosenGame(games, 'atc', config)
    expect(picked?.config).not.toHaveProperty('botSpeed')
  })

  it('falls back to a 501 game, then the first one, when the picked mode is unknown to the backend', () => {
    expect(chosenGame([{ id: 'x501' }, { id: 'other' }], 'missing', {})?.gameId).toBe('x501')
    expect(chosenGame([{ id: 'other' }], 'missing', {})?.gameId).toBe('other')
  })

  it('null when the backend has no games', () => {
    expect(chosenGame([], 'x01', {})).toBeNull()
  })
})
