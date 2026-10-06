import { describe, it, expect } from 'vitest'
import { upSeat, isMyTurn, canThrowNow } from '../turn.js'
import type { Snapshot } from '$lib/api'
import fixture from './fixtures/x01-snapshot.json'

const snap = (patch: {
  mySeats: number[]
  currentPlayer?: number
  bullOff?: unknown
  bots?: Record<number, { level: number } | null>
}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  const seats = base.seats.map((s, i) => ({ ...s, bot: patch.bots?.[i] ?? null }))
  return {
    ...base,
    mySeats: patch.mySeats,
    seats,
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

describe('canThrowNow', () => {
  it('matches isMyTurn for a human seat', () => {
    const s = snap({ mySeats: [1], currentPlayer: 1 })
    expect(canThrowNow(s)).toBe(true)
    expect(isMyTurn(s)).toBe(true)
  })

  it("is false while a bot the host controls is up — the host doesn't throw for it, even though the seat is theirs", () => {
    const s = snap({ mySeats: [0], currentPlayer: 0, bots: { 0: { level: 5 } } })
    // isMyTurn still says yes (the host's own seat is up — this is what keeps Undo reachable)
    expect(isMyTurn(s)).toBe(true)
    // but canThrowNow says no live entry controls for a bot's own turn
    expect(canThrowNow(s)).toBe(false)
  })

  it('is false when it is simply not your turn, bot or not', () => {
    expect(canThrowNow(snap({ mySeats: [1], currentPlayer: 0 }))).toBe(false)
  })

  it('nobody throws without a snapshot', () => {
    expect(canThrowNow(null)).toBe(false)
  })
})
