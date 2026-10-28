import { describe, it, expect } from 'vitest'
import { isFrameMessage } from '../bigscreen/frame.js'
import { bullOffOf, gameState } from '../gameState.js'
import { pendingRoll } from '../minigolf/match.js'
import type { MinigolfGame } from '../api/game-ws'
import type { Snapshot } from '../ws.js'

describe('isFrameMessage', () => {
  it('takes only the big screen state', () => {
    expect(isFrameMessage({ type: 'bigscreen.state', state: {} })).toBe(true)
    expect(isFrameMessage({ type: 'other' })).toBe(false)
    expect(isFrameMessage('bigscreen.ready')).toBe(false)
    expect(isFrameMessage(null)).toBe(false)
  })
})

describe('bullOffOf', () => {
  const bullOff = { throws: [], sequence: [], currentPlayer: 0, result: null }
  it('is the bull off of a game still in it, else null', () => {
    const x01 = (phase: string) => ({ gameId: 'x01', game: { phase, bullOff } }) as unknown as Snapshot
    expect(bullOffOf(gameState(x01('bulloff')))).toBe(bullOff)
    expect(bullOffOf(gameState(x01('game')))).toBeNull()
    expect(bullOffOf(gameState(null))).toBeNull()
  })
})

describe('pendingRoll', () => {
  const game = (finished: boolean) =>
    ({
      finished,
      tries: [],
      holeIdx: 3,
      lastHole: null,
      lastStroke: { hole: 3, seat: 0, stroke: 2, path: [{}, {}], others: [], hits: [], holed: true },
    }) as unknown as MinigolfGame
  it('holds the last stroke’s roll until it has played', () => {
    expect(pendingRoll(game(true), null)).toBe('stroke:3:0:2')
    expect(pendingRoll(game(true), 'stroke:3:0:2')).toBeNull()
  })
  it('holds nothing before the game is over, or without a game', () => {
    expect(pendingRoll(game(false), null)).toBeNull()
    expect(pendingRoll(null, null)).toBeNull()
  })
})
