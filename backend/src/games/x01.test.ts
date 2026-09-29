import { describe, it, expect } from 'vitest'
import { x01Game, x01Module } from './x01.js'
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
    opened: [true, true], phase: 'game', order: [0, 1],
    currentPlayer: 0, round: 1,
    bustThisVisit: false, visitOpenedScores: [501, 501],
    winner: null, playerCount: 2, ...overrides,
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
  const { state } = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } as any })
  return state
}

// ─── init ────────────────────────────────────────────────────────────────────

describe('init', () => {
  it('starts with startScore for all players', () => {
    const s = x01Game.init(defaultCfg, players)
    expect(s.scores).toEqual([501, 501])
    expect(s.legs).toEqual([0, 0])
    expect(s.winner).toBeNull()
  })

  it('stage is bulloff when bullOff !== off', () => {
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    expect(s.stage).toBe('bulloff')
    expect(s.bullOff.active).toBe(true)
  })

  it('stage is game when bullOff === off', () => {
    const s = x01Module.init(defaultCfg, players)
    expect(s.stage).toBe('game')
    expect(s.bullOff.active).toBe(false)
  })

  it('validate: rejects bull off with fewer than two players', () => {
    const solo: Player[] = [{ name: 'Solo' }]
    expect(x01Module.validate!({ ...defaultCfg, bullOff: 'wdc' }, solo)).toMatch(/at least two players/)
    expect(x01Module.validate!({ ...defaultCfg, bullOff: 'pdc' }, solo)).toMatch(/at least two players/)
    expect(x01Module.validate!({ ...defaultCfg, bullOff: 'off' }, solo)).toBeNull()
    expect(x01Module.validate!({ ...defaultCfg, bullOff: 'wdc' }, players)).toBeNull()
  })

  it('single player: bull off is skipped, so darts score', () => {
    const solo: Player[] = [{ name: 'Solo' }]
    const s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, solo)
    expect(s.stage).toBe('game')
    expect(s.bullOff.active).toBe(false)
    // A dart must count down rather than be swallowed by the bull off
    const opened = x01Module.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } as any }).state
    const { state } = x01Module.onBoardEvent(opened, dartEvent(20, 'SingleOuter', 1))
    expect(state.game.scores[0]).toBe(481)
  })

  it('throwing order defaults to player index order', () => {
    expect(x01Game.init(defaultCfg, [...players, { name: 'Cy' }]).order).toEqual([0, 1, 2])
  })

  it('straight in: opened = true for all players', () => {
    const s = x01Game.init(defaultCfg, players)
    expect(s.opened).toEqual([true, true])
  })

  it('double in: opened = false for all players', () => {
    const s = x01Game.init({ ...defaultCfg, inMode: 'double' }, players)
    expect(s.opened).toEqual([false, false])
  })

  it('master in: opened = false for all players', () => {
    const s = x01Game.init({ ...defaultCfg, inMode: 'master' }, players)
    expect(s.opened).toEqual([false, false])
  })
})

// ─── getCurrentPlayer ─────────────────────────────────────────────────────────

describe('getCurrentPlayer', () => {
  it('returns currentPlayer during game phase', () => {
    const s = makeState({ currentPlayer: 1, phase: 'game' })
    expect(x01Game.getCurrentPlayer(s)).toBe(1)
  })
})

// ─── visit.opened ────────────────────────────────────────────────────────────

describe('visit.opened', () => {
  it('snapshots scores for bust revert and resets bustThisVisit', () => {
    const s = makeState({ scores: [180, 501], bustThisVisit: true })
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } as any })
    expect(state.visitOpenedScores).toEqual([180, 501])
    expect(state.bustThisVisit).toBe(false)
  })
})

// ─── dart.detected — scoring ─────────────────────────────────────────────────

describe('dart.detected — straight in, double out', () => {
  it('subtracts score from current player', () => {
    const s = openedVisit(makeState({ scores: [180, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.scores[0]).toBe(120)
    expect(state.bustThisVisit).toBe(false)
  })

  it('bounce-out (multiplier=0) leaves score unchanged', () => {
    const s = openedVisit(makeState({ scores: [180, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Outside', 0))
    expect(state.scores[0]).toBe(180)
  })

  it('bust: overshoot reverts score', () => {
    const s = openedVisit(makeState({ scores: [10, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(10)
    expect(state.bustThisVisit).toBe(true)
  })

  it('bust: land on 0 with single when outMode=double reverts score', () => {
    const s = openedVisit(makeState({ scores: [20, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(20)
    expect(state.bustThisVisit).toBe(true)
  })

  it('win: double on exact remaining does not bust', () => {
    const s = openedVisit(makeState({ scores: [20, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(10, 'Double', 2))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('dart after bust: score stays reverted', () => {
    // Do NOT use openedVisit here — that would reset bustThisVisit
    const s = makeState({ scores: [10, 501], visitOpenedScores: [10, 501], bustThisVisit: true })
    const { state } = x01Game.onBoardEvent(s, dartEvent(5, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(10)
  })

  it('50_50 bull value: outer bull (25) scores 50', () => {
    const cfg = { ...defaultCfg, bullValue: '50_50' as const }
    const s = openedVisit(makeState({ cfg, scores: [100, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(25, 'Single', 1))
    expect(state.scores[0]).toBe(50)
  })

  it('50_50 bull value: outer bull (25, multiplier=1) cannot finish on double out', () => {
    const cfg = { ...defaultCfg, bullValue: '50_50' as const, outMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, scores: [50, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(25, 'Single', 1))
    expect(state.scores[0]).toBe(50)
    expect(state.bustThisVisit).toBe(true)
  })

  it('straight out: finish on single', () => {
    const cfg = { ...defaultCfg, outMode: 'straight' as const }
    const s = openedVisit(makeState({ cfg, scores: [20, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('master out: finish on triple', () => {
    const cfg = { ...defaultCfg, outMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, scores: [60, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('master out: bust on single when hitting 0', () => {
    const cfg = { ...defaultCfg, outMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, scores: [20, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(20)
    expect(state.bustThisVisit).toBe(true)
  })
})

// ─── double in / master in ───────────────────────────────────────────────────

describe('double in / master in', () => {
  it('double in: dart before opening is ignored (score unchanged)', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(501)
    expect(state.opened[0]).toBe(false)
  })

  it('double in: double dart opens and scores in one throw', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Double', 2))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(461)
  })

  it('double in: unopened player cannot bust', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.bustThisVisit).toBe(false)
    expect(state.scores[0]).toBe(501)
  })

  it('master in: triple opens and scores', () => {
    const cfg = { ...defaultCfg, inMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Triple', 3))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(441)
  })

  it('master in: single does not open', () => {
    const cfg = { ...defaultCfg, inMode: 'master' as const }
    const s = openedVisit(makeState({ cfg, opened: [false, true], scores: [501, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.opened[0]).toBe(false)
    expect(state.scores[0]).toBe(501)
  })

  it('double in: opened status resets between legs', () => {
    const cfg = { ...defaultCfg, inMode: 'double' as const, firstTo: 1 }
    // Win a leg
    let s = openedVisit(makeState({ cfg, scores: [20, 501], opened: [true, true] }))
    let { state: afterWin } = x01Game.onBoardEvent(s, dartEvent(10, 'Double', 2))
    const { state: afterTakeout } = x01Game.onBoardEvent(afterWin, { kind: 'takeout.finished', data: {} as any })
    // firstTo=1, so player 0 won — but they need another leg to check reset
    // Since firstTo=1, match is done; test with firstTo=2 instead
    const cfg2 = { ...defaultCfg, inMode: 'double' as const, firstTo: 2 }
    let s2 = openedVisit(makeState({ cfg: cfg2, scores: [20, 501], opened: [true, true] }))
    const { state: afterWin2 } = x01Game.onBoardEvent(s2, dartEvent(10, 'Double', 2))
    const { state: newLeg } = x01Game.onBoardEvent(afterWin2, { kind: 'takeout.finished', data: {} as any })
    expect(newLeg.opened[0]).toBe(false)
    expect(newLeg.opened[1]).toBe(false)
  })
})

// ─── takeout.finished — player rotation ──────────────────────────────────────

describe('takeout.finished — rotation and rounds', () => {
  it('advances currentPlayer', () => {
    const s = makeState({ currentPlayer: 0 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(1)
  })

  it('wraps back to player 0 and increments round', () => {
    const s = makeState({ currentPlayer: 1, round: 1 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.currentPlayer).toBe(0)
    expect(state.round).toBe(2)
  })

  it('leg win: legs incremented, scores and opened reset, leg winner starts', () => {
    const cfg = { ...defaultCfg, firstTo: 3 }
    const s = openedVisit(makeState({ cfg, scores: [0, 501], legs: [0, 0], currentPlayer: 0 }))
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.legs[0]).toBe(1)
    expect(state.scores).toEqual([501, 501])
    expect(state.currentPlayer).toBe(0)
    expect(state.round).toBe(1)
  })

  it('match win: winner set when legs === firstTo', () => {
    const s = openedVisit(makeState({ scores: [0, 501], legs: [2, 0], currentPlayer: 0 }))
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
    expect(state.legs[0]).toBe(3)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: player with lowest score wins when round exceeds limit', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    // Last player (1) just finished round 2 → nextPlayer=0, round=3 > 2 → player 0 (100) wins
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 200] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: lowest index wins on tied scores', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 100] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} as any })
    expect(state.winner).toBe(0)
  })
})

// ─── visit.cleared ───────────────────────────────────────────────────────────

describe('visit.cleared', () => {
  it('advances currentPlayer without scoring', () => {
    const s = makeState({ scores: [200, 501], currentPlayer: 0 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.cleared', data: {} as any })
    expect(state.currentPlayer).toBe(1)
    expect(state.scores[0]).toBe(200)
  })

  it('enforces maxRounds: lowest score wins when round limit exceeded on cleared visit', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    const s = makeState({ cfg, currentPlayer: 1, round: 2, scores: [100, 150] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.cleared', data: {} as any })
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe(0)
  })
})

// ─── throwing order ──────────────────────────────────────────────────────────

describe('throwing order', () => {
  const three: Player[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  const takeout: BoardEvent = { kind: 'takeout.finished', data: {} as any }

  it('rotates through a custom order and counts rounds from its first thrower', () => {
    let s: X01State = { ...x01Game.init(defaultCfg, three), order: [2, 0, 1], currentPlayer: 2 }
    s = x01Game.onBoardEvent(s, takeout).state
    expect([s.currentPlayer, s.round]).toEqual([0, 1])
    s = x01Game.onBoardEvent(s, takeout).state
    expect([s.currentPlayer, s.round]).toEqual([1, 1])
    s = x01Game.onBoardEvent(s, takeout).state
    expect([s.currentPlayer, s.round]).toEqual([2, 2])
  })
})

// ─── bull off integration ────────────────────────────────────────────────────

describe('bull off integration', () => {
  const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v' } as any }
  const takeout: BoardEvent = { kind: 'takeout.finished', data: {} as any }

  // A dart at `mm` from the centre, as the cameras report it
  function dartAt(mm: number): BoardEvent {
    const segment = mm <= 6.35 ? { name: 'Bull', number: 50, bed: 'Double', multiplier: 2 }
      : mm <= 15.9 ? { name: '25', number: 25, bed: 'Single', multiplier: 1 }
      : { name: 'S20', number: 20, bed: 'SingleInner', multiplier: 1 }
    return {
      kind: 'dart.detected',
      data: { visit_id: 'v', index: 0, source_seq: 1,
        dart: { segment, score: segment.number * segment.multiplier, polar: { r: mm / 170, theta_deg: 90 } } } as any,
    }
  }

  function play(s: ReturnType<typeof x01Module.init>, ...events: BoardEvent[]) {
    return events.reduce((acc, e) => x01Module.onBoardEvent(acc, e).state, s)
  }

  it('closest to the centre throws first, and the game follows the ranked order', () => {
    const three: Player[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    let s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, three)
    s = play(s, opened, dartAt(31.5), takeout, opened, dartAt(4.1), takeout, opened, dartAt(12.8), takeout)
    expect(s.stage).toBe('bulloff')
    expect(s.bullOff.result).toEqual({ order: [1, 2, 0], rethrow: false })

    // Next visit starts the game with B throwing, and scores count
    s = play(s, opened, dartEvent(20, 'SingleOuter', 1))
    expect(s.stage).toBe('game')
    expect(s.game.order).toEqual([1, 2, 0])
    expect(s.game.currentPlayer).toBe(1)
    expect(s.game.scores).toEqual([501, 481, 501])
  })

  it('bulloff_start begins the game without waiting for a dart', () => {
    let s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    s = play(s, opened, dartAt(20), takeout, opened, dartAt(9), takeout)
    s = x01Module.onUserAction(s, { type: 'bulloff_start' }).state
    expect(s.stage).toBe('game')
    expect(s.game.currentPlayer).toBe(1)
  })

  it('a tie within 0.5 mm rethrows in reverse order', () => {
    let s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    s = play(s, opened, dartAt(10.2), takeout, opened, dartAt(10.5), takeout)
    expect(s.bullOff.result).toMatchObject({ rethrow: true, reason: 'tie' })

    s = play(s, opened)
    expect(s.stage).toBe('bulloff')
    expect(s.bullOff.throws).toEqual([null, null])
    expect(x01Module.getCurrentPlayer(s)).toBe(1)
    expect(x01Module.view(s, players).currentPlayer).toBe(1)

    // Bob throws first this time, then Alice
    s = play(s, dartAt(30), takeout, opened, dartAt(2), takeout)
    expect(s.bullOff.result).toEqual({ order: [0, 1], rethrow: false })
  })

  it('only the first dart of a visit counts', () => {
    let s = x01Module.init({ ...defaultCfg, bullOff: 'wdc' }, players)
    s = play(s, opened, dartAt(40), dartAt(1))
    expect(s.bullOff.throws[0]?.mm).toBe(40)
    expect(x01Module.view(s, players).visitLocked).toBe(true)
  })
})

// ─── view ─────────────────────────────────────────────────────────────────────

describe('view', () => {
  it('returns expected fields', () => {
    const s = makeState({ scores: [180, 501], legs: [1, 0], currentPlayer: 1, winner: null })
    const v = x01Game.view(s, players)
    expect(v.scores).toEqual([180, 501])
    expect(v.legs).toEqual([1, 0])
    expect(v.firstTo).toBe(3)
    expect(v.currentPlayer).toBe(1)
    expect(v.winner).toBeNull()
    expect((v.config as any).outMode).toBe('double')
  })

  it('does not include totalDarts (tracked by engine, not module)', () => {
    const v = x01Game.view(makeState(), players)
    expect(v).not.toHaveProperty('totalDarts')
  })
})
