import { describe, it, expect } from 'vitest'
import { gameState } from '../gameState.js'

const base = {
  type: 'snapshot' as const,
  sessionId: 's',
  boardId: null,
  players: [{ name: 'A' }],
  bmStatus: null,
  status: 'active' as const,
  finishPending: false,
  canUndoVisit: false,
  ownerUserId: 'u1',
  lobbyId: null,
  lobbyName: null,
  mySeats: [0],
  seats: [
    {
      controllerUserId: 'u1',
      userId: null,
      boardId: 'b1',
      boardName: 'Board',
      boardOnline: true,
      controllerConnected: true,
      disconnectedAt: null,
      forfeited: false,
      bot: null,
    },
  ],
}

describe('gameState', () => {
  it('narrows an X01 snapshot', () => {
    const game = { scores: [501] } as any
    expect(gameState({ ...base, gameId: 'x01', game })).toEqual({ x01: game, atc: null, minigolf: null })
  })
  it('narrows an ATC snapshot', () => {
    const game = { targets: [1] } as any
    expect(gameState({ ...base, gameId: 'atc', game })).toEqual({ x01: null, atc: game, minigolf: null })
  })
  it('narrows a Minigolf snapshot', () => {
    const game = { holeIdx: 0 } as any
    expect(gameState({ ...base, gameId: 'minigolf', game })).toEqual({ x01: null, atc: null, minigolf: game })
  })
  it('unknown game ids give null', () => {
    expect(gameState({ ...base, gameId: 'soccer', game: {} } as any)).toEqual({ x01: null, atc: null, minigolf: null })
    expect(gameState(null)).toEqual({ x01: null, atc: null, minigolf: null })
  })
})
