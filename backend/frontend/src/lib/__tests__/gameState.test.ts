import { describe, it, expect } from 'vitest'
import { gameState } from '../gameState.js'

const base = {
  type: 'snapshot' as const,
  sessionId: 's',
  boardId: null,
  players: [{ name: 'A' }],
  bmStatus: null,
  status: 'active' as const,
  results: null,
  finishPending: false,
  canUndoVisit: false,
  scoreBased: false,
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

const none = { x01: null, atc: null, minigolf: null, p121: null, hilo: null, cricket: null }

describe('gameState', () => {
  it('narrows an X01 snapshot', () => {
    const game = { scores: [501] } as any
    expect(gameState({ ...base, gameId: 'x01', game })).toEqual({ ...none, x01: game })
  })
  it('narrows an ATC snapshot', () => {
    const game = { targets: [1] } as any
    expect(gameState({ ...base, gameId: 'atc', game })).toEqual({ ...none, atc: game })
  })
  it('narrows a Minigolf snapshot', () => {
    const game = { holeIdx: 0 } as any
    expect(gameState({ ...base, gameId: 'minigolf', game })).toEqual({ ...none, minigolf: game })
  })
  it('narrows a 121 snapshot', () => {
    const game = { phase: 'game' } as any
    expect(gameState({ ...base, gameId: 'p121', game })).toEqual({ ...none, p121: game })
  })
  it('narrows a Higher Lower snapshot', () => {
    const game = { phase: 'game' } as any
    expect(gameState({ ...base, gameId: 'hilo', game })).toEqual({ ...none, hilo: game })
  })
  it('narrows a Cricket snapshot', () => {
    const game = { phase: 'game' } as any
    expect(gameState({ ...base, gameId: 'cricket', game })).toEqual({ ...none, cricket: game })
  })
  it('unknown game ids give null', () => {
    expect(gameState({ ...base, gameId: 'soccer', game: {} } as any)).toEqual(none)
    expect(gameState(null)).toEqual(none)
  })
})
