import { describe, it, expect } from 'vitest'
import { upSeat, isMyTurn } from '../turn.js'
import type { Snapshot } from '$lib/api'
import fixture from './fixtures/x01-snapshot.json'

const snap = (patch: { mySeats: number[]; currentPlayer?: number; bullOff?: unknown }): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  return {
    ...base, mySeats: patch.mySeats,
    game: { ...base.game, currentPlayer: patch.currentPlayer ?? 0, ...(patch.bullOff !== undefined && { bullOff: patch.bullOff }) },
  } as Snapshot
}

describe('upSeat / isMyTurn', () => {
  it('follows the game turn', () => {
    expect(upSeat(snap({ mySeats: [1], currentPlayer: 1 }))).toBe(1)
    expect(isMyTurn(snap({ mySeats: [1], currentPlayer: 1 }))).toBe(true)
    expect(isMyTurn(snap({ mySeats: [1], currentPlayer: 0 }))).toBe(false)
  })

  it('during a bull off: the thrower, then the winner once decided', () => {
    const throwing = { throws: [], sequence: [0, 1], currentPlayer: 1, result: null }
    expect(upSeat(snap({ mySeats: [], bullOff: throwing }))).toBe(1)
    const decided = { ...throwing, result: { order: [0, 1], rethrow: false } }
    expect(upSeat(snap({ mySeats: [], bullOff: decided }))).toBe(0)
  })

  it('nobody acts without a snapshot', () => {
    expect(isMyTurn(null)).toBe(false)
  })
})
