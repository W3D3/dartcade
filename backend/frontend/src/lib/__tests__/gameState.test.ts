import { describe, it, expect } from 'vitest'
import { gameState } from '../gameState.js'

const base = { type: 'snapshot' as const, sessionId: 's', boardId: null, players: [{ name: 'A' }], bmStatus: null }

describe('gameState', () => {
  it('narrows an X01 snapshot', () => {
    const game = { scores: [501] } as any
    expect(gameState({ ...base, gameId: 'x01', game })).toEqual({ x01: game, atc: null })
  })
  it('narrows an ATC snapshot', () => {
    const game = { targets: [1] } as any
    expect(gameState({ ...base, gameId: 'atc', game })).toEqual({ x01: null, atc: game })
  })
  it('unknown game ids give null', () => {
    expect(gameState({ ...base, gameId: 'soccer', game: {} } as any)).toEqual({ x01: null, atc: null })
    expect(gameState(null)).toEqual({ x01: null, atc: null })
  })
})
