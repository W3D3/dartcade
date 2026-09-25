import { describe, it, expect } from 'vitest'
import { atcModule } from './atc.js'
import type { ATCConfig, ATCState } from './atc.js'
import type { BoardEvent, Player } from '../session/types.js'

const players: Player[] = [{ name: 'Alice' }, { name: 'Bob' }]
const defaultCfg: ATCConfig = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false }

function makeState(overrides: Partial<ATCState> = {}): ATCState {
  return {
    targets: [1, 1], currentPlayer: 0, allHitThisVisit: true, winner: null,
    cfg: defaultCfg, playerCount: 2, ...overrides,
  }
}

function dartEvent(number: number, bed: string, multiplier: number, index = 0): BoardEvent {
  return {
    kind: 'dart.detected',
    data: {
      visit_id: 'v1', index,
      dart: { segment: { name: '', number, bed, multiplier }, score: number * multiplier },
      source_seq: 1,
    } as any,
  }
}

describe('init', () => {
  it('starts all players at target 1', () => {
    const s = atcModule.init(defaultCfg, players)
    expect(s.targets).toEqual([1, 1])
    expect(s.currentPlayer).toBe(0)
    expect(s.winner).toBeNull()
    expect(s.allHitThisVisit).toBe(false)
  })
})

describe('onBoardEvent dart.detected', () => {
  it('advances target on hit', () => {
    const s = makeState({ targets: [5, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(5, 'SingleOuter', 1))
    expect(state.targets[0]).toBe(6)
    expect(state.winner).toBeNull()
  })

  it('does not advance on miss', () => {
    const s = makeState({ targets: [5, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(7, 'SingleOuter', 1))
    expect(state.targets[0]).toBe(5)
    expect(state.allHitThisVisit).toBe(false)
  })

  it('sets winner when target exceeds finishTarget (twenty)', () => {
    const s = makeState({ targets: [20, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(20, 'SingleInner', 1))
    expect(state.targets[0]).toBe(21)
    expect(state.winner).toBe(0)
  })

  it('bounce-out (multiplier 0) does not advance', () => {
    const s = makeState({ targets: [5, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(5, 'Outside', 0))
    expect(state.targets[0]).toBe(5)
    expect(state.allHitThisVisit).toBe(false)
  })
})

describe('onBoardEvent visit.opened', () => {
  it('resets allHitThisVisit to true', () => {
    const s = makeState({ allHitThisVisit: false })
    const { state } = atcModule.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v2' } as any })
    expect(state.allHitThisVisit).toBe(true)
  })
})

describe('onBoardEvent takeout.finished', () => {
  it('advances currentPlayer', () => {
    const s = makeState({ currentPlayer: 0 })
    const { state } = atcModule.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(1)
  })

  it('wraps back to player 0', () => {
    const s = makeState({ currentPlayer: 1 })
    const { state } = atcModule.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
  })

  it('does nothing when winner is set', () => {
    const s = makeState({ winner: 0, currentPlayer: 0 })
    const { state } = atcModule.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
  })

  it('throwAgainOnAllHit: does not advance when all darts hit', () => {
    const s = makeState({ cfg: { ...defaultCfg, throwAgainOnAllHit: true }, allHitThisVisit: true, currentPlayer: 0 })
    const { state } = atcModule.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
  })

  it('throwAgainOnAllHit at win: session ends, no extra throw granted', () => {
    const s = makeState({
      cfg: { ...defaultCfg, throwAgainOnAllHit: true },
      allHitThisVisit: true, winner: 0, currentPlayer: 0,
    })
    const { state } = atcModule.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
    expect(state.winner).toBe(0)
  })
})

describe('multiplierAdvances', () => {
  it('triple on target advances by 3 (finishOn twenty)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true }
    const s = makeState({ cfg, targets: [5, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(5, 'Triple', 3))
    expect(state.targets[0]).toBe(8)
  })

  it('advance capped at 20 when bull is required (finishOn single_bull)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [18, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(18, 'Triple', 3))
    expect(state.targets[0]).toBe(20)
  })

  it('from target 20 advances to bull checkpoint 21 (finishOn single_bull)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [20, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.targets[0]).toBe(21)
  })
})

describe('finishOn single_bull', () => {
  it('target 21 hit by single bull (25) advances to 22 = win', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [21, 1] })
    const { state } = atcModule.onBoardEvent(s, {
      kind: 'dart.detected',
      data: {
        visit_id: 'v1', index: 0,
        dart: { segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 }, score: 25 },
        source_seq: 1,
      } as any,
    })
    expect(state.targets[0]).toBe(22)
    expect(state.winner).toBe(0)
  })

  it('target 21 hit by double bull (50) also wins', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [21, 1] })
    const { state } = atcModule.onBoardEvent(s, {
      kind: 'dart.detected',
      data: {
        visit_id: 'v1', index: 0,
        dart: { segment: { name: '50', number: 50, bed: 'Double', multiplier: 2 }, score: 50 },
        source_seq: 1,
      } as any,
    })
    expect(state.targets[0]).toBe(22)
    expect(state.winner).toBe(0)
  })
})

describe('finishOn bull', () => {
  it('from target 20 advances to 22 (bull checkpoint)', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'bull' }
    const s = makeState({ cfg, targets: [20, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(20, 'SingleInner', 1))
    expect(state.targets[0]).toBe(22)
  })

  it('target 22 hit by double bull (50) wins', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'bull' }
    const s = makeState({ cfg, targets: [22, 1] })
    const { state } = atcModule.onBoardEvent(s, {
      kind: 'dart.detected',
      data: {
        visit_id: 'v1', index: 0,
        dart: { segment: { name: '50', number: 50, bed: 'Double', multiplier: 2 }, score: 50 },
        source_seq: 1,
      } as any,
    })
    expect(state.targets[0]).toBe(23)
    expect(state.winner).toBe(0)
  })

  it('target 22: single bull (25) does not win', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'bull' }
    const s = makeState({ cfg, targets: [22, 1] })
    const { state } = atcModule.onBoardEvent(s, {
      kind: 'dart.detected',
      data: {
        visit_id: 'v1', index: 0,
        dart: { segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 }, score: 25 },
        source_seq: 1,
      } as any,
    })
    expect(state.targets[0]).toBe(22)
    expect(state.winner).toBeNull()
  })
})

describe('visit.cleared', () => {
  it('advances currentPlayer without scoring', () => {
    const s = makeState({ targets: [5, 1], currentPlayer: 0 })
    const { state } = atcModule.onBoardEvent(s, { kind: 'visit.cleared', data: {} as any })
    expect(state.currentPlayer).toBe(1)
    expect(state.targets[0]).toBe(5)
  })
})

describe('view', () => {
  it('returns targets, currentPlayer, winner', () => {
    const s = makeState({ targets: [3, 7], winner: null, currentPlayer: 1 })
    const v = atcModule.view(s, players)
    expect(v.targets).toEqual([3, 7])
    expect(v.currentPlayer).toBe(1)
    expect(v.winner).toBeNull()
  })
})
