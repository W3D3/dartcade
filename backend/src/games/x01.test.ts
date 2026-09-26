import { describe, it, expect } from 'vitest'
import { x01Module } from './x01.js'
import type { X01Config, X01State } from './x01.js'
import type { BoardEvent, Player } from '../session/types.js'

const players: Player[] = [{ name: 'Alice' }, { name: 'Bob' }]

const defaultCfg: X01Config = {
  startScore: 501, inMode: 'straight', outMode: 'double',
  bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
}

function makeState(overrides: Partial<X01State> = {}): X01State {
  return {
    cfg: defaultCfg, scores: [501, 501], legs: [0, 0],
    opened: [true, true], phase: 'game',
    bullOff: { active: false, darts: [null, null], currentPlayer: 0, playerCount: 2 },
    currentPlayer: 0, round: 1,
    bustThisVisit: false, visitOpenedScores: [501, 501],
    totalDarts: [0, 0], winner: null, playerCount: 2, ...overrides,
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function openedVisit(s: X01State): X01State {
  const { state } = x01Module.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } as any })
  return state
}

// ─── init ────────────────────────────────────────────────────────────────────

describe('init', () => {
  it('starts with startScore for all players', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.scores).toEqual([501, 501])
    expect(s.legs).toEqual([0, 0])
    expect(s.winner).toBeNull()
  })

  it('phase is bulloff when bullOff !== off', () => {
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    expect(s.phase).toBe('bulloff')
  })

  it('phase is game when bullOff === off', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.phase).toBe('game')
  })

  it('straight in: opened = true for all players', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.opened).toEqual([true, true])
  })

  it('double in: opened = false for all players', () => {
    const s = x01Module.init({ ...defaultCfg, inMode: 'double' }, players)
    expect(s.opened).toEqual([false, false])
  })

  it('master in: opened = false for all players', () => {
    const s = x01Module.init({ ...defaultCfg, inMode: 'master' }, players)
    expect(s.opened).toEqual([false, false])
  })

  it('bullOff state active when wdc', () => {
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    expect(s.bullOff.active).toBe(true)
  })

  it('bullOff state inactive when off', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.bullOff.active).toBe(false)
  })
})

// ─── visit.opened ────────────────────────────────────────────────────────────

describe('visit.opened', () => {
  it('snapshots scores for bust revert and resets bustThisVisit', () => {
    const s = makeState({ scores: [180, 501], bustThisVisit: true })
    const { state } = x01Module.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } as any })
    expect(state.visitOpenedScores).toEqual([180, 501])
    expect(state.bustThisVisit).toBe(false)
  })
})

// ─── dart.detected — scoring ─────────────────────────────────────────────────

describe('dart.detected — straight in, double out', () => {
  it('subtracts score from current player', () => {
    const s = openedVisit(makeState({ scores: [180, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.scores[0]).toBe(120)
    expect(state.bustThisVisit).toBe(false)
  })

  it('increments totalDarts for current player only', () => {
    const s = openedVisit(makeState({ totalDarts: [2, 0] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.totalDarts[0]).toBe(3)
    expect(state.totalDarts[1]).toBe(0)
  })

  it('bounce-out (multiplier=0) leaves score unchanged but increments totalDarts', () => {
    const s = openedVisit(makeState({ scores: [180, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'Outside', 0))
    expect(state.scores[0]).toBe(180)
    expect(state.totalDarts[0]).toBe(1)
  })

  it('bust: overshoot reverts score', () => {
    const s = openedVisit(makeState({ scores: [10, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(10)
    expect(state.bustThisVisit).toBe(true)
  })

  it('bust: land on 0 with single when outMode=double reverts score', () => {
    const s = openedVisit(makeState({ scores: [20, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(20)
    expect(state.bustThisVisit).toBe(true)
  })

  it('win: double on exact remaining does not bust', () => {
    const s = openedVisit(makeState({ scores: [20, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(10, 'Double', 2))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('dart after bust: score stays reverted, totalDarts still increments', () => {
    // Do NOT use openedVisit here — that would reset bustThisVisit
    const s = makeState({ scores: [10, 501], visitOpenedScores: [10, 501], bustThisVisit: true })
    const { state } = x01Module.onBoardEvent(s, dartEvent(5, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(10)
    expect(state.totalDarts[0]).toBe(1)
  })

  it('50_50 bull value: outer bull (25) scores 50', () => {
    const cfg = { ...defaultCfg, bullValue: '50_50' as const }
    const s = openedVisit(makeState({ cfg, scores: [100, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(25, 'Single', 1))
    expect(state.scores[0]).toBe(50)
  })

  it('50_50 bull value: outer bull (25, multiplier=1) cannot finish on double out', () => {
    const cfg = { ...defaultCfg, bullValue: '50_50' as const, outMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, scores: [50, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(25, 'Single', 1))
    expect(state.scores[0]).toBe(50)
    expect(state.bustThisVisit).toBe(true)
  })

  it('straight out: finish on single', () => {
    const cfg = { ...defaultCfg, outMode: 'straight' as const }
    const s = openedVisit(makeState({ cfg, scores: [20, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('master out: finish on triple', () => {
    const cfg = { ...defaultCfg, outMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, scores: [60, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('master out: bust on single when hitting 0', () => {
    const cfg = { ...defaultCfg, outMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, scores: [20, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(20)
    expect(state.bustThisVisit).toBe(true)
  })
})

// ─── double in / master in ───────────────────────────────────────────────────

describe('double in / master in', () => {
  it('double in: dart before opening is ignored (score unchanged)', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(501)
    expect(state.opened[0]).toBe(false)
  })

  it('double in: double dart opens and scores in one throw', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'Double', 2))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(461)
  })

  it('double in: unopened player cannot bust', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.bustThisVisit).toBe(false)
    expect(state.scores[0]).toBe(501)
  })

  it('master in: triple opens and scores', () => {
    const cfg = { ...defaultCfg, inMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(441)
  })

  it('master in: single does not open', () => {
    const cfg = { ...defaultCfg, inMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Module.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.opened[0]).toBe(false)
    expect(state.scores[0]).toBe(501)
  })

  it('double in: opened status resets between legs', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const, firstTo: 1 }
    // Win a leg
    let s = openedVisit(makeState({ cfg, scores: [20, 501], opened: [true, true] }))
    let { state: afterWin } = x01Module.onBoardEvent(s, dartEvent(10, 'Double', 2))
    const { state: afterTakeout } = x01Module.onBoardEvent(afterWin, { kind: 'takeout.finished', data: {} as any })
    // firstTo=1, so player 0 won — but they need another leg to check reset
    // Since firstTo=1, match is done; test with firstTo=2 instead
    const cfg2 = { ...defaultCfg, inMode: 'double' as const, firstTo: 2 }
    let s2 = openedVisit(makeState({ cfg: cfg2, scores: [20, 501], opened: [true, true] }))
    const { state: afterWin2 } = x01Module.onBoardEvent(s2, dartEvent(10, 'Double', 2))
    const { state: newLeg } = x01Module.onBoardEvent(afterWin2, { kind: 'takeout.finished', data: {} as any })
    expect(newLeg.opened[0]).toBe(false)
    expect(newLeg.opened[1]).toBe(false)
  })
})

// ─── takeout.finished — player rotation ──────────────────────────────────────

describe('takeout.finished — rotation and rounds', () => {
  it('advances currentPlayer', () => {
    const s = makeState({ currentPlayer: 0 })
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(1)
  })

  it('wraps back to player 0 and increments round', () => {
    const s = makeState({ currentPlayer: 1, round: 1 })
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
    expect(state.round).toBe(2)
  })

  it('leg win: legs incremented, scores and opened reset, leg winner starts', () => {
    const cfg = { ...defaultCfg, firstTo: 3 }
    const s = openedVisit(makeState({ cfg, scores: [0, 501], legs: [0, 0], currentPlayer: 0 }))
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.legs[0]).toBe(1)
    expect(state.scores).toEqual([501, 501])
    expect(state.currentPlayer).toBe(0)
    expect(state.round).toBe(1)
  })

  it('match win: winner set when legs === firstTo', () => {
    const s = openedVisit(makeState({ scores: [0, 501], legs: [2, 0], currentPlayer: 0 }))
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
    expect(state.legs[0]).toBe(3)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: player with lowest score wins when round exceeds limit', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    // Last player (1) just finished round 2 → nextPlayer=0, round=3 > 2 → player 0 (100) wins
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 200] })
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: lowest index wins on tied scores', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 100] })
    const { state } = x01Module.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
  })
})

// ─── visit.cleared ───────────────────────────────────────────────────────────

describe('visit.cleared', () => {
  it('advances currentPlayer without scoring', () => {
    const s = makeState({ scores: [200, 501], currentPlayer: 0 })
    const { state } = x01Module.onBoardEvent(s, { kind: 'visit.cleared', data: {} as any })
    expect(state.currentPlayer).toBe(1)
    expect(state.scores[0]).toBe(200)
  })
})

// ─── bull off integration ────────────────────────────────────────────────────

describe('bull off integration', () => {
  function bullOffState(): X01State {
    return makeState({
      phase: 'bulloff',
      bullOff: { active: true, darts: [null, null], currentPlayer: 0, playerCount: 2 },
      opened: [false, false],
      currentPlayer: 0,
    })
  }

  function bullDart(score: number): BoardEvent {
    const number = score === 50 ? 50 : score === 25 ? 25 : score
    const bed = score === 50 ? 'Double' : 'Single'
    const multiplier = score === 50 ? 2 : 1
    return dartEvent(number, bed, multiplier)
  }

  it('records first dart in bulloff phase', () => {
    const s = bullOffState()
    const { state: s1 } = x01Module.onBoardEvent(s, bullDart(50))
    expect(s1.bullOff.darts[0]).toBe(50)
  })

  it('clear winner: transitions to game, winner is currentPlayer', () => {
    let s = bullOffState()
    const { state: s1 } = x01Module.onBoardEvent(s, bullDart(50))
    const { state: s2 } = x01Module.onBoardEvent(s1, { kind: 'takeout.finished', data: {} as any })
    // player 1 still needs to throw
    expect(s2.phase).toBe('bulloff')
    expect(s2.currentPlayer).toBe(1)
    const { state: s3 } = x01Module.onBoardEvent(s2, bullDart(25))
    const { state: s4 } = x01Module.onBoardEvent(s3, { kind: 'takeout.finished', data: {} as any })
    expect(s4.phase).toBe('game')
    expect(s4.currentPlayer).toBe(0)
    expect(s4.scores).toEqual([501, 501])
  })

  it('tie: resets for re-throw', () => {
    let s = bullOffState()
    const { state: s1 } = x01Module.onBoardEvent(s, bullDart(50))
    const { state: s2 } = x01Module.onBoardEvent(s1, { kind: 'takeout.finished', data: {} as any })
    const { state: s3 } = x01Module.onBoardEvent(s2, bullDart(50))
    const { state: s4 } = x01Module.onBoardEvent(s3, { kind: 'takeout.finished', data: {} as any })
    expect(s4.phase).toBe('bulloff')
    expect(s4.bullOff.darts).toEqual([null, null])
    expect(s4.bullOff.currentPlayer).toBe(0)
  })
})

// ─── view ─────────────────────────────────────────────────────────────────────

describe('view', () => {
  it('returns expected fields', () => {
    const s = makeState({ scores: [180, 501], legs: [1, 0], currentPlayer: 1, winner: null })
    const v = x01Module.view(s, players)
    expect(v.scores).toEqual([180, 501])
    expect(v.legs).toEqual([1, 0])
    expect(v.firstTo).toBe(3)
    expect(v.currentPlayer).toBe(1)
    expect(v.winner).toBeNull()
    expect((v.config as any).outMode).toBe('double')
  })
})
