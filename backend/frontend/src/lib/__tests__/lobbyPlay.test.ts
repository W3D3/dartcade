import { describe, it, expect } from 'vitest'
import { boardToApply, lobbyPath, playAction } from '../lobby/play.js'

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
  const boards = [{ id: 'b1', name: 'Garage' }, { id: 'b2', name: 'Kitchen' }]

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
