import { describe, it, expect } from 'vitest'
import { x01Game, x01Module, configMeta } from './x01.js'
import type { X01Config, X01State } from './x01.js'
import type { BoardEvent, Player } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'

const players: Player[] = [{ name: 'Alice' }, { name: 'Bob' }]

const defaultCfg: X01Config = {
  startScore: 501,
  inMode: 'straight',
  outMode: 'double',
  bullOff: 'off',
  botSpeed: 'normal',
  bullValue: '25_50',
  maxRounds: 50,
  firstTo: 3,
}

function makeState(overrides: Partial<X01State> = {}): X01State {
  const n = overrides.playerCount ?? 2
  return {
    cfg: defaultCfg,
    scores: [501, 501],
    legs: [0, 0],
    opened: [true, true],
    phase: 'game',
    order: [0, 1],
    // Singles: every seat its own team
    teamOf: Array.from({ length: n }, (_, i) => i),
    turn: 0,
    currentPlayer: 0,
    round: 1,
    bustThisVisit: false,
    visitOpenedScores: [501, 501],
    winner: null,
    playerCount: 2,
    pointsScored: Array<number>(n).fill(0),
    bestCheckout: Array<number>(n).fill(0),
    visitDarts: 0,
    legVisits: [],
    lastVisit: Array<null>(n).fill(null),
    dartsThrown: Array<number>(n).fill(0),
    checkoutAttempts: Array<number>(n).fill(0),
    checkoutHits: Array<number>(n).fill(0),
    ...overrides,
  }
}

function dartEvent(number: number, bed: string, multiplier: number, index = 0): BoardEvent {
  return {
    kind: 'dart.detected',
    data: {
      visit_id: 'v1',
      index,
      dart: { segment: { name: '', number, bed, multiplier }, score: number * multiplier },
      source_seq: 1,
    } as any,
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function openedVisit(s: X01State): X01State {
  const { state } = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } })
  return state
}

// Opens a visit for the current player, throws the darts and ends it with a takeout
function playVisit(s: X01State, darts: BoardEvent[]): X01State {
  let state = openedVisit(s)
  for (const d of darts) state = x01Game.onBoardEvent(state, d).state
  return x01Game.onBoardEvent(state, { kind: 'takeout.finished', data: {} }).state
}

const T20 = dartEvent(20, 'Triple', 3)
const S20 = dartEvent(20, 'Single', 1)
const S1 = dartEvent(1, 'Single', 1)
const D20 = dartEvent(20, 'Double', 2)
const D10 = dartEvent(10, 'Double', 2)

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
    const opened = x01Module.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } }).state
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

  it("defaults botSpeed to 'normal', and configMeta describes it", () => {
    expect(x01Game.defaultConfig.botSpeed).toBe('normal')
    expect(configMeta.botSpeed.options?.map(o => o.value)).toEqual(['fast', 'normal', 'slow'])
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
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: { visit_id: 'v1' } })
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
    // Win a leg; with firstTo=1 that would end the match, so firstTo=2
    const cfg2 = { ...defaultCfg, inMode: 'double' as const, firstTo: 2 }
    const s2 = openedVisit(makeState({ cfg: cfg2, scores: [20, 501], opened: [true, true] }))
    const { state: afterWin2 } = x01Game.onBoardEvent(s2, dartEvent(10, 'Double', 2))
    const { state: newLeg } = x01Game.onBoardEvent(afterWin2, { kind: 'takeout.finished', data: {} })
    expect(newLeg.opened[0]).toBe(false)
    expect(newLeg.opened[1]).toBe(false)
  })
})

// ─── takeout.finished — player rotation ──────────────────────────────────────

describe('takeout.finished — rotation and rounds', () => {
  it('advances currentPlayer', () => {
    const s = makeState({ currentPlayer: 0 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.currentPlayer).toBe(1)
  })

  it('wraps back to player 0 and increments round', () => {
    const s = makeState({ currentPlayer: 1, round: 1 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.currentPlayer).toBe(0)
    expect(state.round).toBe(2)
  })

  it('leg win: legs incremented, scores and opened reset, the next player in throw order starts', () => {
    const cfg = { ...defaultCfg, firstTo: 3 }
    const s = openedVisit(makeState({ cfg, scores: [0, 501], legs: [0, 0], currentPlayer: 0 }))
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.legs[0]).toBe(1)
    expect(state.scores).toEqual([501, 501])
    expect(state.currentPlayer).toBe(1)
    expect(state.round).toBe(1)
  })

  it('the start moves on every leg, whoever wins, and rounds count from the leg starter', () => {
    const cfg = { ...defaultCfg, firstTo: 3 }
    const three = makeState({
      cfg,
      scores: [501, 501, 501],
      legs: [0, 0, 0],
      opened: [true, true, true],
      order: [0, 1, 2],
      visitOpenedScores: [501, 501, 501],
      playerCount: 3,
      pointsScored: [0, 0, 0],
      bestCheckout: [0, 0, 0],
    })
    const takeout = (st: X01State) => x01Game.onBoardEvent(st, { kind: 'takeout.finished', data: {} }).state
    // Leg 1: player 2 wins it → leg 2 starts with player 1 (next in order after the leg-1 starter 0)
    let s = takeout(openedVisit({ ...three, currentPlayer: 2, scores: [100, 100, 0] }))
    expect([s.currentPlayer, s.round]).toEqual([1, 1])
    // Leg 2 runs 1, 2, 0, then back to its starter 1 in round 2
    s = takeout(s)
    expect([s.currentPlayer, s.round]).toEqual([2, 1])
    s = takeout(s)
    expect([s.currentPlayer, s.round]).toEqual([0, 1])
    s = takeout(s)
    expect([s.currentPlayer, s.round]).toEqual([1, 2])
    // Player 1 wins leg 2 → leg 3 starts with player 2, leg 4 would start with player 0 again
    s = takeout(openedVisit({ ...s, scores: [100, 0, 100] }))
    expect([s.currentPlayer, s.round, s.legs]).toEqual([2, 1, [0, 1, 1]])
    s = takeout(openedVisit({ ...s, currentPlayer: 0, scores: [0, 100, 100] }))
    expect(s.currentPlayer).toBe(0)
  })

  it('match win: winner set when legs === firstTo', () => {
    const s = openedVisit(makeState({ scores: [0, 501], legs: [2, 0], currentPlayer: 0 }))
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.winner).toBe(0)
    expect(state.legs[0]).toBe(3)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: player with lowest score wins when round exceeds limit', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    // Last player (1) just finished round 2 → nextPlayer=0, round=3 > 2 → player 0 (100) wins
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 200] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.winner).toBe(0)
    expect(state.phase).toBe('finished')
  })

  it('max rounds: lowest index wins on tied scores', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    const s = makeState({ cfg, round: 2, currentPlayer: 1, scores: [100, 100] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} })
    expect(state.winner).toBe(0)
  })
})

// ─── visit.cleared ───────────────────────────────────────────────────────────

describe('visit.cleared', () => {
  it('advances currentPlayer without scoring', () => {
    const s = makeState({ scores: [200, 501], currentPlayer: 0 })
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.cleared', data: {} })
    expect(state.currentPlayer).toBe(1)
    expect(state.scores[0]).toBe(200)
  })

  it('enforces maxRounds: lowest score wins when round limit exceeded on cleared visit', () => {
    const cfg = { ...defaultCfg, maxRounds: 2 }
    const s = makeState({ cfg, currentPlayer: 1, round: 2, scores: [100, 150] })
    const { state } = x01Game.onBoardEvent(s, { kind: 'visit.cleared', data: {} })
    expect(state.phase).toBe('finished')
    expect(state.winner).toBe(0)
  })
})

// ─── throwing order ──────────────────────────────────────────────────────────

describe('throwing order', () => {
  const three: Player[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
  const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

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
  const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v' } }
  const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

  // A dart at `mm` from the centre, as the cameras report it
  function dartAt(mm: number): BoardEvent {
    const segment =
      mm <= 6.35
        ? { name: 'Bull', number: 50, bed: 'Double', multiplier: 2 }
        : mm <= 15.9
          ? { name: '25', number: 25, bed: 'Single', multiplier: 1 }
          : { name: 'S20', number: 20, bed: 'SingleInner', multiplier: 1 }
    return {
      kind: 'dart.detected',
      data: {
        visit_id: 'v',
        index: 0,
        source_seq: 1,
        dart: { segment, score: segment.number * segment.multiplier, polar: { r: mm / 170, theta_deg: 90 } },
      } as any,
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

  it('exposes botSpeed through the view, for the bot scheduler to read without touching internal state', () => {
    const players = [{ name: 'Christoph' }]
    const s = x01Game.init({ ...x01Game.defaultConfig, botSpeed: 'fast' }, players)
    expect(x01Game.view(s, players).config.botSpeed).toBe('fast')
  })

  it("defaults botSpeed to 'normal' when a session started before the field existed has none stored", () => {
    // A pre-botSpeed session's stored config has no such key at all (its startPlan-merged
    // defaults predate the field, and rebuildOne doesn't re-merge current defaults on
    // restore) — view() must not omit the (schema-required) field just because cfg lacks it.
    const players = [{ name: 'Christoph' }]
    const s = makeState({})
    const { botSpeed: _omit, ...cfgWithoutBotSpeed } = s.cfg
    const old = { ...s, cfg: cfgWithoutBotSpeed as unknown as typeof s.cfg }
    expect(x01Game.view(old, players).config.botSpeed).toBe('normal')
  })
})

describe('bull as a double, leaving 1', () => {
  it('bull finishes a double-out leg', () => {
    const s = openedVisit(makeState({ scores: [50, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(50, 'Double', 1))
    expect(state.scores[0]).toBe(0)
    expect(state.bustThisVisit).toBe(false)
  })

  it('bull opens a double-in player', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, inMode: 'double' }, opened: [false, false] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(50, 'Double', 1))
    expect(state.opened[0]).toBe(true)
    expect(state.scores[0]).toBe(451)
  })

  it('leaving 1 on double out busts', () => {
    const s = openedVisit(makeState({ scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(21)
    expect(state.bustThisVisit).toBe(true)
  })

  it('leaving 1 on master out busts', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, outMode: 'master' }, scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.bustThisVisit).toBe(true)
  })

  it('leaving 1 on straight out is fine', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, outMode: 'straight' }, scores: [21, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'SingleOuter', 1))
    expect(state.scores[0]).toBe(1)
    expect(state.bustThisVisit).toBe(false)
  })

  it('leaving 1 with the opening dart on double in / double out busts', () => {
    const s = openedVisit(makeState({ cfg: { ...defaultCfg, inMode: 'double' }, opened: [false, false], scores: [41, 501] }))
    const { state } = x01Game.onBoardEvent(s, dartEvent(20, 'Double', 2))
    expect(state.scores[0]).toBe(41)
    expect(state.bustThisVisit).toBe(true)
  })
})

// ─── teams ───────────────────────────────────────────────────────────────────

describe('teams', () => {
  const four: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }, { name: 'B2' }]
  const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v' } }
  const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
  const team2v2: X01Config = { ...defaultCfg, format: 'teams', teams: [0, 1, 0, 1], startScore: 101 }

  function play(s: X01State, ...events: BoardEvent[]): X01State {
    return events.reduce((acc, e) => x01Game.onBoardEvent(acc, e).state, s)
  }
  const visit = (s: X01State, ...darts: BoardEvent[]) => play(s, opened, ...darts, takeout)
  const t20 = () => dartEvent(20, 'Triple', 3)
  const s20 = () => dartEvent(20, 'SingleOuter', 1)
  const miss = () => dartEvent(0, 'Outside', 0)

  it("2v2: a visit by A2 counts down Team A's score", () => {
    let s = x01Game.init(team2v2, four)
    s = visit(s, s20())
    s = visit(s, miss())
    s = visit(s, t20())
    const v = x01Game.view(s, four)
    expect(v.scores).toEqual([21, 101, 21, 101])
    expect(v.teams).toEqual([
      { id: 'A', name: 'Team A', seats: [0, 2], score: 21, legs: 0 },
      { id: 'B', name: 'Team B', seats: [1, 3], score: 101, legs: 0 },
    ])
    expect(s.pointsScored).toEqual([20, 0, 60, 0])
  })

  it('2v2: a bust by the second player reverts the team score to the start of their visit', () => {
    let s = x01Game.init(team2v2, four)
    s = visit(s, t20()) // A1: 41
    s = visit(s, miss()) // B1
    s = play(s, opened, t20()) // A2 overshoots 41 → bust
    expect(s.bustThisVisit).toBe(true)
    expect(x01Game.view(s, four).scores).toEqual([41, 101, 41, 101])
    s = play(s, takeout)
    expect(s.pointsScored).toEqual([60, 0, 0, 0])
    expect(s.currentPlayer).toBe(3)
  })

  it('2v2: a checkout by either player wins the leg for the team', () => {
    let s = x01Game.init({ ...team2v2, startScore: 61, firstTo: 2 }, four)
    s = visit(s, s20()) // A1: 41
    s = visit(s, miss()) // B1
    s = visit(s, dartEvent(1, 'SingleInner', 1), dartEvent(20, 'Double', 2)) // A2 checks out 41
    const v = x01Game.view(s, four)
    expect(v.legs).toEqual([1, 0, 1, 0])
    expect(v.teams?.map(t => [t.score, t.legs])).toEqual([
      [61, 1],
      [61, 0],
    ])
    expect(s.bestCheckout).toEqual([0, 0, 41, 0])
    // The next leg starts with Team B's first seat
    expect([s.currentPlayer, s.round]).toEqual([1, 1])
    s = visit(s, miss())
    expect(s.currentPlayer).toBe(2)
    s = visit(s, miss())
    expect(s.currentPlayer).toBe(3)
    s = visit(s, miss())
    expect([s.currentPlayer, s.round]).toEqual([0, 1])
    s = visit(s, miss())
    expect([s.currentPlayer, s.round]).toEqual([1, 2])
  })

  it('2v1: the single player throws every other turn', () => {
    const three: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }]
    let s = x01Game.init({ ...defaultCfg, format: 'teams', teams: [0, 1, 0] }, three)
    const seen = [s.currentPlayer]
    s = visit(s, miss())
    expect(x01Game.view(s, three).nextPlayer).toBe(2)
    seen.push(s.currentPlayer)
    for (let i = 0; i < 2; i++) {
      s = visit(s, miss())
      seen.push(s.currentPlayer)
    }
    expect(seen).toEqual([0, 1, 2, 1])
    expect(s.round).toBe(1)
    // B1 throws twice a round: who's next depends on the turn, not just the thrower
    expect(x01Game.view(s, three).nextPlayer).toBe(0)
    s = visit(s, miss())
    expect([s.currentPlayer, s.round]).toEqual([0, 2])
  })

  it('teams: the winner is the team; summarize places both team members first', () => {
    let s = x01Game.init({ ...team2v2, startScore: 40, firstTo: 1 }, four)
    s = visit(s, s20()) // A1: 20 left
    s = visit(s, dartEvent(20, 'Double', 2)) // B1 checks out 40
    expect(s.phase).toBe('finished')
    expect(s.winner).toBe(1)
    expect(x01Game.view(s, four).winner).toBe(1)
    const r = x01Game.summarize(s, { totalDarts: [1, 1, 0, 0], totalVisits: [1, 1, 0, 0] })
    expect(r.map(x => x.placement)).toEqual([2, 1, 2, 1])
    expect(r.map(x => [x.stats.pointsScored, x.stats.dartsThrown, x.stats.legsWon])).toEqual([
      [20, 1, 0],
      [40, 1, 1],
      [0, 0, 0],
      [0, 0, 1],
    ])
  })

  it('teamStart random picks the starting team with the rng', () => {
    const s = x01Game.init({ ...team2v2, teamStart: 'random' }, four, () => 0.7)
    expect(s.currentPlayer).toBe(1)
    expect(s.order).toEqual([1, 0, 3, 2])
    expect(x01Game.init({ ...team2v2, teamStart: 'random' }, four, () => 0.2).currentPlayer).toBe(0)
  })

  it('singles view has no teams', () => {
    const v = x01Game.view(x01Game.init(defaultCfg, players), players)
    expect(v).not.toHaveProperty('teams')
  })

  it('validate: teams need one entry per player, and both teams a player', () => {
    expect(x01Module.validate!(team2v2, four)).toBeNull()
    expect(x01Module.validate!({ ...team2v2, teams: [0, 1, 0] }, four)).toMatch(/teams/)
    expect(x01Module.validate!({ ...team2v2, teams: [0, 0, 0, 0] }, four)).toMatch(/teams/)
    expect(x01Module.validate!({ ...team2v2, teams: [0, 1, 2, 1] }, four)).toMatch(/teams/)
    expect(x01Module.validate!({ ...team2v2, teams: undefined }, four)).toMatch(/teams/)
  })

  it("bull off: the winner's team starts, and the teams take turns", () => {
    let s = x01Module.init({ ...team2v2, bullOff: 'wdc' }, four)
    s = x01Module.onUserAction(s, { type: 'bulloff_start' }).state // no result yet: ignored
    expect(s.stage).toBe('bulloff')
    const started = { ...s, bullOff: { ...s.bullOff, result: { order: [2, 1, 3, 0], rethrow: false } } }
    const after = x01Module.onUserAction(started, { type: 'bulloff_start' }).state
    // A2 won: A2 throws first, Team A's seats rotated to start at A2
    expect(after.game.order).toEqual([2, 1, 0, 3])
    expect(after.game.currentPlayer).toBe(2)
    const bStarts = x01Module.onUserAction(
      { ...s, bullOff: { ...s.bullOff, result: { order: [1, 0, 3, 2], rethrow: false } } },
      { type: 'bulloff_start' },
    ).state
    expect(bStarts.game.order).toEqual([1, 0, 3, 2])
    expect(x01Module.teamsOf!(bStarts)).toEqual([0, 1, 0, 1])
    expect(x01Module.teams).toBe(true)
  })

  it('bull off won by B2 (seat 3): B2 throws first', () => {
    const s = x01Module.init({ ...team2v2, bullOff: 'wdc' }, four)
    const won = { ...s, bullOff: { ...s.bullOff, result: { order: [3, 0, 1, 2], rethrow: false } } }
    const after = x01Module.onUserAction(won, { type: 'bulloff_start' }).state
    expect(after.game.currentPlayer).toBe(3)
    expect(after.game.order).toEqual([3, 0, 1, 2])
    expect(x01Module.getCurrentPlayer(after)).toBe(3)
  })

  describe('nextPlayer: who throws after the open visit', () => {
    const three: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }]
    const team2v1: X01Config = { ...defaultCfg, format: 'teams', teams: [0, 1, 0], startScore: 101, firstTo: 2 }

    it('mid-leg in 2v1 follows the turn order (A1 B1 A2 B1)', () => {
      let s = x01Game.init(team2v1, three)
      expect(x01Game.view(s, three).nextPlayer).toBe(1)
      s = visit(s, miss()) // A1 → B1 up
      expect(x01Game.view(s, three).nextPlayer).toBe(2)
      s = visit(s, miss()) // B1 → A2 up
      expect(x01Game.view(s, three).nextPlayer).toBe(1)
      s = visit(s, miss()) // A2 → B1 up
      expect(x01Game.view(s, three).nextPlayer).toBe(0)
    })

    it('after a bust, the next turn as usual', () => {
      let s = x01Game.init(team2v1, three)
      s = visit(s, t20()) // A1: 41
      s = visit(s, miss()) // B1
      s = play(s, opened, t20()) // A2 busts
      expect(s.bustThisVisit).toBe(true)
      expect(x01Game.view(s, three).nextPlayer).toBe(1)
    })

    it("at a locked checkout, the next leg's starter", () => {
      let s = x01Game.init({ ...team2v1, startScore: 40 }, three)
      s = play(s, opened, dartEvent(20, 'Double', 2)) // A1 checks out leg 1, visit locked
      expect(x01Game.view(s, three).visitLocked).toBe(true)
      // Leg 2 starts at the second position in the order: B1
      expect(x01Game.view(s, three).nextPlayer).toBe(1)
      s = play(s, takeout)
      expect(s.currentPlayer).toBe(1)
    })

    it('null once the checkout wins the game, and after it', () => {
      let s = x01Game.init({ ...team2v1, startScore: 40, firstTo: 1 }, three)
      s = play(s, opened, dartEvent(20, 'Double', 2))
      expect(x01Game.view(s, three).nextPlayer).toBeNull()
      s = play(s, takeout)
      expect(s.phase).toBe('finished')
      expect(x01Game.view(s, three).nextPlayer).toBeNull()
    })

    it('null on the last visit before the round limit ends the game', () => {
      let s = x01Game.init({ ...team2v1, maxRounds: 1 }, three)
      s = visit(s, miss())
      s = visit(s, miss())
      s = visit(s, miss()) // A1 B1 A2; B1 throws the last turn
      expect(s.currentPlayer).toBe(1)
      expect(x01Game.view(s, three).nextPlayer).toBeNull()
    })

    it('singles: the next seat in throw order', () => {
      const s = makeState({ order: [1, 0], currentPlayer: 1 })
      expect(x01Game.view(s, players).nextPlayer).toBe(0)
    })

    it('null during the bull off', () => {
      const s = x01Module.init({ ...team2v2, bullOff: 'wdc' }, four)
      expect(x01Module.view(s, four).nextPlayer).toBeNull()
    })
  })

  it('2v1 round limit: the lowest team score wins, both seats of that team placed 1st', () => {
    const three: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }]
    let s = x01Game.init({ ...defaultCfg, format: 'teams', teams: [0, 1, 0], startScore: 101, maxRounds: 1 }, three)
    s = visit(s, s20()) // A1: Team A 81
    s = visit(s, miss()) // B1
    s = visit(s, miss()) // A2
    expect(s.phase).toBe('game')
    s = visit(s, miss()) // B1 again: the round is over
    expect(s.phase).toBe('finished')
    expect(s.winner).toBe(0)
    const r = x01Game.summarize(s, { totalDarts: [1, 2, 1], totalVisits: [1, 2, 1] })
    expect(r.map(x => x.placement)).toEqual([1, 2, 1])
  })

  it('2v1 leg starters rotate through the turn order: A1, B1, A2, B1', () => {
    const three: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }]
    let s = x01Game.init({ ...defaultCfg, format: 'teams', teams: [0, 1, 0], startScore: 40, firstTo: 5 }, three)
    const starters = [s.currentPlayer]
    for (let leg = 0; leg < 3; leg++) {
      s = visit(s, dartEvent(20, 'Double', 2)) // the leg's starter checks out
      starters.push(s.currentPlayer)
      expect(s.round).toBe(1)
    }
    expect(starters).toEqual([0, 1, 2, 1])
    expect(s.legs).toEqual([2, 1])
  })

  it('throwOrder names every seat once, in first-appearance order', () => {
    const three: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }]
    expect(x01Game.throwOrder!(x01Game.init({ ...defaultCfg, format: 'teams', teams: [0, 1, 0] }, three))).toEqual([0, 1, 2])
  })
})

describe('teams detail', () => {
  it('lists the teams with their seats; singles has none', () => {
    const four: Player[] = [{ name: 'A1' }, { name: 'B1' }, { name: 'A2' }, { name: 'B2' }]
    const s = x01Game.init({ ...defaultCfg, format: 'teams', teams: [0, 1, 0, 1] }, four)
    expect(x01Game.detail([], s).teams).toEqual([
      { id: 'A', name: 'Team A', seats: [0, 2] },
      { id: 'B', name: 'Team B', seats: [1, 3] },
    ])
    expect(x01Game.detail([], x01Game.init(defaultCfg, players))).not.toHaveProperty('teams')
  })
})

describe('committed visits', () => {
  it("records each visit for the leg and as the thrower's last, with its darts", () => {
    let s = playVisit(makeState(), [T20, T20, T20])
    const alice = { seat: 0, scored: 180, left: 321, bust: false, darts: 3 }
    expect(s.legVisits).toEqual([alice])
    expect(s.lastVisit).toEqual([alice, null])
    expect(s.dartsThrown).toEqual([3, 0])
    expect(s.pointsScored).toEqual([180, 0])

    s = playVisit(s, [S1, S1, S1])
    const bob = { seat: 1, scored: 3, left: 498, bust: false, darts: 3 }
    expect(s.legVisits).toEqual([alice, bob])
    expect(s.lastVisit).toEqual([alice, bob])
    expect(s.dartsThrown).toEqual([3, 3])
  })

  it('keeps the open visit out of dartsThrown until the takeout', () => {
    const s = x01Game.onBoardEvent(openedVisit(makeState()), T20).state
    expect(s.visitDarts).toBe(1)
    expect(s.dartsThrown).toEqual([0, 0])
    expect(s.legVisits).toEqual([])
  })

  it('a bust records nothing scored, the score it went back to, and the darts thrown', () => {
    const s = playVisit(makeState({ scores: [40, 501], visitOpenedScores: [40, 501] }), [T20])
    expect(s.legVisits).toEqual([{ seat: 0, scored: 0, left: 40, bust: true, darts: 1 }])
    expect(s.dartsThrown).toEqual([1, 0])
  })

  it('a checkout counts only the darts thrown; the next leg starts a new list but keeps the last visit', () => {
    const s = playVisit(makeState({ scores: [40, 501], visitOpenedScores: [40, 501] }), [D20])
    const checkout = { seat: 0, scored: 40, left: 0, bust: false, darts: 1 }
    expect(s.legs).toEqual([1, 0])
    expect(s.legVisits).toEqual([])
    expect(s.lastVisit).toEqual([checkout, null])
    expect(s.dartsThrown).toEqual([1, 0])
  })

  it('the match-winning visit stays in the leg list', () => {
    const s = playVisit(makeState({ scores: [40, 501], visitOpenedScores: [40, 501], cfg: { ...defaultCfg, firstTo: 1 } }), [D20])
    expect(s.phase).toBe('finished')
    expect(s.legVisits).toEqual([{ seat: 0, scored: 40, left: 0, bust: false, darts: 1 }])
  })

  it('darts before opening (double in) count as thrown and score nothing', () => {
    const cfg: X01Config = { ...defaultCfg, inMode: 'double' }
    const s = playVisit(makeState({ cfg, opened: [false, false] }), [S20, S20, S20])
    expect(s.legVisits).toEqual([{ seat: 0, scored: 0, left: 501, bust: false, darts: 3 }])
    expect(s.dartsThrown).toEqual([3, 0])
  })

  it('a cleared visit is recorded too', () => {
    let s = x01Game.onBoardEvent(openedVisit(makeState()), S20).state
    s = x01Game.onBoardEvent(s, { kind: 'visit.cleared', data: {} }).state
    expect(s.legVisits).toEqual([{ seat: 0, scored: 20, left: 481, bust: false, darts: 1 }])
    expect(s.visitDarts).toBe(0)
  })

  it('darts after a bust still count when a correction refolds the visit', () => {
    // Three darts thrown, then the first corrected to T20 on 40: a bust, with two darts after it
    const committed = makeState({ scores: [40, 501], visitOpenedScores: [40, 501] })
    const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v1' } }
    const s = refoldVisit(x01Game, committed, [opened, T20, S1, S1])
    expect(s.visitDarts).toBe(3)
    const done = x01Game.onBoardEvent(s, { kind: 'takeout.finished', data: {} }).state
    expect(done.legVisits).toEqual([{ seat: 0, scored: 0, left: 40, bust: true, darts: 3 }])
  })

  it('init starts every list and count empty', () => {
    const s = x01Game.init(defaultCfg, players)
    expect(s).toMatchObject({ visitDarts: 0, legVisits: [], lastVisit: [null, null], dartsThrown: [0, 0] })
  })
})

describe('checkout darts', () => {
  const on = (score: number, o: Partial<X01State> = {}) =>
    openedVisit(makeState({ scores: [score, 501], visitOpenedScores: [score, 501], ...o }))
  const throwAll = (s: X01State, darts: BoardEvent[]) => darts.reduce((st, d) => x01Game.onBoardEvent(st, d).state, s)

  it('a dart on a one-dart finish is an attempt wherever it lands; the finishing one is a hit', () => {
    // 40 left: S20 misses (20 left, still a one-dart finish), D10 finishes
    const s = throwAll(on(40), [S20, D10])
    expect(s.checkoutAttempts).toEqual([2, 0])
    expect(s.checkoutHits).toEqual([1, 0])
  })

  it('a dart on a score that needs more than one dart is not an attempt', () => {
    expect(throwAll(on(170), [T20]).checkoutAttempts).toEqual([0, 0])
    // 41: S1 leaves 40 (not an attempt), then D20 on 40 (attempt, hit)
    const s = throwAll(on(41), [S1, D20])
    expect(s.checkoutAttempts).toEqual([1, 0])
    expect(s.checkoutHits).toEqual([1, 0])
  })

  it('a bust on a one-dart finish is an attempt and a miss', () => {
    const s = throwAll(on(40), [T20])
    expect(s.bustThisVisit).toBe(true)
    expect(s.checkoutAttempts).toEqual([1, 0])
    expect(s.checkoutHits).toEqual([0, 0])
  })

  it('darts before opening are never attempts', () => {
    const cfg: X01Config = { ...defaultCfg, inMode: 'double' }
    expect(throwAll(on(40, { cfg, opened: [false, false] }), [S20]).checkoutAttempts).toEqual([0, 0])
  })

  it('master out: a finishing triple is a hit', () => {
    const cfg: X01Config = { ...defaultCfg, outMode: 'master' }
    const s = throwAll(on(60, { cfg }), [T20])
    expect(s.checkoutAttempts).toEqual([1, 0])
    expect(s.checkoutHits).toEqual([1, 0])
  })

  it('counts for the thrower, not their team', () => {
    // Teams: seats 0 and 2 are team 0 on 40, seat 2 throwing
    const s = throwAll(
      openedVisit(
        makeState({
          playerCount: 4,
          teamOf: [0, 1, 0, 1],
          order: [0, 1, 2, 3],
          scores: [40, 501],
          visitOpenedScores: [40, 501],
          currentPlayer: 2,
          turn: 2,
        }),
      ),
      [S20],
    )
    expect(s.checkoutAttempts).toEqual([0, 0, 1, 0])
  })

  it('a corrected dart refolded through the open visit leaves the counts right', () => {
    const committed = makeState({ scores: [40, 501], visitOpenedScores: [40, 501] })
    const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v1' } }
    expect(refoldVisit(x01Game, committed, [opened, S20, D10]).checkoutHits).toEqual([1, 0])
    const corrected = refoldVisit(x01Game, committed, [opened, S20, dartEvent(10, 'Single', 1)])
    expect(corrected.checkoutAttempts).toEqual([2, 0])
    expect(corrected.checkoutHits).toEqual([0, 0])
  })

  it('init starts the counts at zero', () => {
    expect(x01Game.init(defaultCfg, players)).toMatchObject({ checkoutAttempts: [0, 0], checkoutHits: [0, 0] })
  })
})
