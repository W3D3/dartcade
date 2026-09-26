import { describe, it, expect } from 'vitest'
import { atcModule, buildSequence } from './atc.js'
import type { ATCConfig, ATCState } from './atc.js'
import type { BoardEvent, Player } from '../session/types.js'

const players: Player[] = [{ name: 'Alice' }, { name: 'Bob' }]
const defaultCfg: ATCConfig = {
  throwAgainOnAllHit: false, finishOn: 'single_bull',
  multiplierAdvances: false, order: 'asc',
}

function makeState(overrides: Partial<ATCState> = {}): ATCState {
  const cfg = overrides.cfg ?? defaultCfg
  const sequence = overrides.sequence ?? buildSequence(cfg)
  return {
    sequence, targets: [1, 1], currentPlayer: 0, allHitThisVisit: true, winner: null,
    cfg, playerCount: 2, ...overrides,
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

describe('buildSequence', () => {
  it('asc order produces 1–20 then 21 for single_bull', () => {
    const seq = buildSequence({ ...defaultCfg, order: 'asc', finishOn: 'single_bull' })
    expect(seq).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21])
  })

  it('desc order produces 20–1 then 21 for single_bull', () => {
    const seq = buildSequence({ ...defaultCfg, order: 'desc', finishOn: 'single_bull' })
    expect(seq).toEqual([20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,21])
  })

  it('asc finishOn twenty ends at 20, no bull', () => {
    const seq = buildSequence({ ...defaultCfg, order: 'asc', finishOn: 'twenty' })
    expect(seq).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20])
  })

  it('asc finishOn bull ends at 22', () => {
    const seq = buildSequence({ ...defaultCfg, order: 'asc', finishOn: 'bull' })
    expect(seq.at(-1)).toBe(22)
    expect(seq.slice(0, -1)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20])
  })

  it('random order has same elements as asc, in different order', () => {
    const seq = buildSequence({ ...defaultCfg, order: 'random', finishOn: 'twenty' })
    expect(seq.slice().sort((a,b) => a-b)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20])
  })
})

describe('init', () => {
  it('starts all players at first sequence element', () => {
    const s = atcModule.init(defaultCfg, players)
    expect(s.targets).toEqual([1, 1])
    expect(s.currentPlayer).toBe(0)
    expect(s.winner).toBeNull()
    expect(s.allHitThisVisit).toBe(false)
  })

  it('desc: starts all players at first sequence element (20)', () => {
    const s = atcModule.init({ ...defaultCfg, order: 'desc' }, players)
    expect(s.targets).toEqual([20, 20])
    expect(s.sequence[0]).toBe(20)
  })

  it('default finishOn is single_bull so sequence ends with 21', () => {
    const s = atcModule.init(defaultCfg, players)
    expect(s.sequence.at(-1)).toBe(21)
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

  it('sets winner when target exceeds sequence (twenty)', () => {
    const cfg: ATCConfig = { ...defaultCfg, finishOn: 'twenty' }
    const s = makeState({ cfg, targets: [20, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(20, 'SingleInner', 1))
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
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, finishOn: 'twenty' }
    const s = makeState({ cfg, targets: [5, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(5, 'Triple', 3))
    expect(state.targets[0]).toBe(8)
  })

  it('advance capped at last number when bull is required (finishOn single_bull)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [18, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(18, 'Triple', 3))
    expect(state.targets[0]).toBe(20)
  })

  it('from last number before bull, advances to bull checkpoint (finishOn single_bull)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [20, 1] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.targets[0]).toBe(21)
  })

  it('desc: triple on target 18 advances by 3 steps (to 15)', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, order: 'desc', finishOn: 'twenty' }
    const s = makeState({ cfg, targets: [18, 20] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(18, 'Triple', 3))
    expect(state.targets[0]).toBe(15)
  })

  it('desc: advance capped at 1 (last before bull) with single_bull', () => {
    const cfg: ATCConfig = { ...defaultCfg, multiplierAdvances: true, order: 'desc', finishOn: 'single_bull' }
    const s = makeState({ cfg, targets: [3, 20] })
    const { state } = atcModule.onBoardEvent(s, dartEvent(3, 'Triple', 3))
    expect(state.targets[0]).toBe(1)
  })
})

describe('finishOn single_bull', () => {
  it('target 21 hit by single bull (25) advances to win', () => {
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
    expect(state.winner).toBe(0)
  })
})

describe('finishOn bull', () => {
  it('from last number 20 advances to 22 (bull checkpoint)', () => {
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
  it('returns targets, sequence, currentPlayer, winner', () => {
    const s = makeState({ targets: [3, 7], winner: null, currentPlayer: 1 })
    const v = atcModule.view(s, players)
    expect(v.targets).toEqual([3, 7])
    expect(v.sequence).toBeDefined()
    expect(v.currentPlayer).toBe(1)
    expect(v.winner).toBeNull()
  })
})
