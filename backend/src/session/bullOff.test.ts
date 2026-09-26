import { describe, it, expect } from 'vitest'
import { initBullOff, onBullOffDart, onBullOffTakeout } from './bullOff.js'
import type { BullOffConfig, BullOffState } from './bullOff.js'

const wdcCfg: BullOffConfig = { mode: 'wdc', playerCount: 2 }
const pdcCfg: BullOffConfig = { mode: 'pdc', playerCount: 2 }

function state(overrides: Partial<BullOffState> = {}): BullOffState {
  return {
    darts: [null, null],
    currentPlayer: 0,
    playerCount: 2,
    ...overrides,
  }
}

describe('initBullOff', () => {
  it('returns inactive state for mode=off', () => {
    const s = initBullOff({ mode: 'off', playerCount: 2 })
    expect(s.active).toBe(false)
  })

  it('returns active state for mode=wdc', () => {
    const s = initBullOff(wdcCfg)
    expect(s.active).toBe(true)
    expect(s.currentPlayer).toBe(0)
    expect(s.darts).toEqual([null, null])
  })

  it('returns active state for mode=pdc', () => {
    const s = initBullOff(pdcCfg)
    expect(s.active).toBe(true)
  })

  it('initialises darts array to playerCount nulls', () => {
    const s = initBullOff({ mode: 'wdc', playerCount: 3 })
    expect(s.darts).toEqual([null, null, null])
    expect(s.playerCount).toBe(3)
  })
})

describe('onBullOffDart', () => {
  it('records first dart for current player', () => {
    const s = state()
    const next = onBullOffDart(s, 50)
    expect(next.darts[0]).toBe(50)
  })

  it('ignores subsequent darts in same visit (first dart already recorded)', () => {
    const s = state({ darts: [50, null] })
    const next = onBullOffDart(s, 25)
    expect(next.darts[0]).toBe(50)
  })

  it('records dart for player 1', () => {
    const s = state({ currentPlayer: 1, darts: [50, null] })
    const next = onBullOffDart(s, 25)
    expect(next.darts[1]).toBe(25)
  })
})

describe('onBullOffTakeout', () => {
  it('advances to next player if not all have thrown', () => {
    const s = state({ darts: [50, null], currentPlayer: 0 })
    const result = onBullOffTakeout(s)
    expect(result.state.currentPlayer).toBe(1)
    expect(result.done).toBe(false)
  })

  it('clear winner: done=true, winner=index of highest dart', () => {
    const s = state({ darts: [50, 25], currentPlayer: 1 })
    const result = onBullOffTakeout(s)
    expect(result.done).toBe(true)
    expect(result.winner).toBe(0)
  })

  it('tie: done=true, winner=null (rethrow)', () => {
    const s = state({ darts: [50, 50], currentPlayer: 1 })
    const result = onBullOffTakeout(s)
    expect(result.done).toBe(true)
    expect(result.winner).toBeNull()
  })

  it('all outside: done=true, winner=null (rethrow)', () => {
    const s = state({ darts: [17, 18], currentPlayer: 1 })
    const result = onBullOffTakeout(s)
    expect(result.done).toBe(true)
    expect(result.winner).toBeNull()
  })

  it('25 beats outside', () => {
    const s = state({ darts: [17, 25], currentPlayer: 1 })
    const result = onBullOffTakeout(s)
    expect(result.done).toBe(true)
    expect(result.winner).toBe(1)
  })

  it('on rethrow, resets darts and currentPlayer to 0', () => {
    const s = state({ darts: [50, 50], currentPlayer: 1 })
    const result = onBullOffTakeout(s)
    expect(result.state.darts).toEqual([null, null])
    expect(result.state.currentPlayer).toBe(0)
  })

  it('3 players: only advances until all have thrown', () => {
    const s: BullOffState = { darts: [50, null, null], currentPlayer: 1, playerCount: 3, active: true }
    const r1 = onBullOffTakeout(s)
    expect(r1.done).toBe(false)
    expect(r1.state.currentPlayer).toBe(2)
    const s2 = { ...r1.state, darts: [50, 25, null] as (number | null)[] }
    const r2 = onBullOffTakeout({ ...s2, darts: [50, 25, 30] })
    expect(r2.done).toBe(true)
    expect(r2.winner).toBe(0)
  })

  it('3 players tie on 50: rethrow', () => {
    const s: BullOffState = { darts: [50, 50, 25], currentPlayer: 2, playerCount: 3, active: true }
    const result = onBullOffTakeout(s)
    expect(result.done).toBe(true)
    expect(result.winner).toBeNull()
  })
})
