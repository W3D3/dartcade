import { describe, it, expect } from 'vitest'
import { shanghaiGame, shanghaiModule, dartResult, MAX_EXTRA_ROUNDS, type ShanghaiConfig, type ShanghaiState } from './shanghai.js'
import type { BoardEvent } from '../session/types.js'
import { roundTargets } from '../shared/shanghai.js'

const cfg: ShanghaiConfig = { start: 1, end: 7, bullRound: false, shanghaiWins: true, tieBreak: 'bull', bullOff: 'off' }
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

type D = [number, number]
/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: ShanghaiState, ...visits: D[][]): ShanghaiState {
  for (const v of visits) {
    s = shanghaiGame.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = shanghaiGame.onBoardEvent(s, dart(n, m, i)).state))
    s = shanghaiGame.onBoardEvent(s, takeout).state
  }
  return s
}
const duo = (c: Partial<ShanghaiConfig> = {}) => shanghaiGame.init({ ...cfg, ...c }, [{ name: 'A' }, { name: 'B' }])
const MISS: D = [0, 0]
const OTHER: D = [20, 3]

describe('config', () => {
  it('accepts the default and the presets', () => {
    expect(shanghaiGame.validate!(cfg, [])).toBeNull()
    expect(shanghaiGame.validate!({ ...cfg, end: 20 }, [])).toBeNull()
    expect(shanghaiGame.validate!({ ...cfg, start: 5, end: 5 }, [])).toBeNull()
  })
  it.each([
    { start: 0 },
    { end: 21 },
    { start: 8, end: 7 },
    { start: 1.5 },
    { shanghaiWins: 'yes' },
    { tieBreak: 'coin' },
    { bullRound: 1 },
  ])('refuses %o', bad => expect(shanghaiGame.validate!({ ...cfg, ...bad } as any, [])).not.toBeNull())
  it('lists the rounds, the bull last', () => {
    expect(roundTargets({ start: 3, end: 5, bullRound: true })).toEqual([3, 4, 5, 25])
  })
})

describe('scoring', () => {
  it('only the round number scores', () => {
    expect(dartResult({ segment: { number: 3, multiplier: 3 }, score: 9 } as any, 3)).toEqual({ score: 9, kind: 'treble' })
    expect(dartResult({ segment: { number: 3, multiplier: 2 }, score: 6 } as any, 3)).toEqual({ score: 6, kind: 'double' })
    expect(dartResult({ segment: { number: 4, multiplier: 3 }, score: 12 } as any, 3)).toEqual({ score: 0, kind: null })
    expect(dartResult({ segment: { number: 0, multiplier: 0 }, score: 0 } as any, 3)).toEqual({ score: 0, kind: null })
  })
  it('a visit adds its hits to the seat and passes the turn', () => {
    const s = play(duo(), [[1, 1], [1, 2], OTHER])
    expect(s.scores).toEqual([3, 0])
    expect(s).toMatchObject({ currentPlayer: 1, round: 1 })
    expect(s.visits[0]).toMatchObject({ seat: 0, round: 1, target: 1, score: 3 })
  })
  it('the round moves on once everyone has thrown', () => {
    const s = play(duo(), [[1, 1]], [MISS], [[2, 3]])
    expect(s).toMatchObject({ round: 2, currentPlayer: 1, scores: [7, 0] })
    expect(s.visits.map(v => [v.seat, v.round])).toEqual([
      [0, 1],
      [1, 1],
      [0, 2],
    ])
  })
})

describe('Shanghai', () => {
  const perms: [string, D[]][] = [
    [
      'S D T',
      [
        [1, 1],
        [1, 2],
        [1, 3],
      ],
    ],
    [
      'T D S',
      [
        [1, 3],
        [1, 2],
        [1, 1],
      ],
    ],
    [
      'D S T',
      [
        [1, 2],
        [1, 1],
        [1, 3],
      ],
    ],
  ]
  it.each(perms)('%s wins at once', (_n, darts) => {
    const s = play(duo(), darts)
    expect(s).toMatchObject({ phase: 'finished', winner: 0, shanghai: 0, scores: [6, 0] })
    expect(s.visits).toHaveLength(1)
  })
  it("wins from a later round with that round's number", () => {
    const s = play(
      duo(),
      [MISS],
      [MISS],
      [
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    )
    expect(s).toMatchObject({ phase: 'finished', winner: 0, shanghai: 0 })
    // round 1 is still on: a Shanghai of another number is no Shanghai
    expect(
      play(duo(), [
        [1, 1],
        [1, 2],
        [2, 3],
      ]).phase,
    ).toBe('game')
  })
  it('later darts and events are ignored once it ended', () => {
    let s = play(duo(), [
      [1, 1],
      [1, 2],
      [1, 3],
    ])
    const done = s
    s = shanghaiGame.onBoardEvent(s, dart(1, 3)).state
    s = shanghaiGame.onBoardEvent(s, takeout).state
    expect(s).toEqual(done)
  })
  it('only scores when the option is off', () => {
    const s = play(duo({ shanghaiWins: false }), [
      [1, 1],
      [1, 2],
      [1, 3],
    ])
    expect(s).toMatchObject({ phase: 'game', scores: [6, 0], currentPlayer: 1 })
    expect(s.visits[0].hits).toEqual({ single: true, double: true, treble: true })
  })
  it('two singles and a treble is not one', () =>
    expect(
      play(duo(), [
        [1, 1],
        [1, 1],
        [1, 3],
      ]).phase,
    ).toBe('game'))
  it('the bull round has none', () => {
    const s = play(
      duo({ start: 1, end: 1, bullRound: true }),
      [MISS],
      [MISS],
      [
        [25, 1],
        [50, 2],
        [50, 1],
      ],
    )
    expect(s.phase).toBe('game')
    expect(s.scores).toEqual([125, 0])
  })
})

describe('the end', () => {
  const short = (c: Partial<ShanghaiConfig> = {}) => duo({ start: 1, end: 2, ...c })
  it('the highest total after the last round wins', () => {
    const s = play(short(), [[1, 1]], [MISS], [[2, 1]], [[2, 2]])
    expect(s).toMatchObject({ phase: 'finished', winner: 1, scores: [3, 4] })
    expect(shanghaiGame.summarize(s, { totalDarts: [2, 2], totalVisits: [2, 2] }).map(r => r.placement)).toEqual([2, 1])
  })
  it('the bull round comes after the last number', () => {
    const s = play(short({ bullRound: true }), [MISS], [MISS], [MISS], [MISS])
    expect(s).toMatchObject({ phase: 'game', round: 3 })
    expect(shanghaiGame.view(s, []).target).toBe(25)
    expect(shanghaiGame.view(s, []).rounds).toBe(3)
  })
  it('a tie plays bull rounds between the tied seats only', () => {
    const three = shanghaiGame.init({ ...cfg, start: 1, end: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    let s = play(three, [[1, 1]], [[1, 1]], [MISS])
    expect(s).toMatchObject({ phase: 'game', round: 2, contenders: [0, 1], currentPlayer: 0 })
    expect(shanghaiGame.view(s, []).target).toBe(25)
    s = play(s, [[25, 1]], [[50, 2]])
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })
    expect(shanghaiGame.summarize(s, { totalDarts: [4, 4, 3], totalVisits: [2, 2, 1] }).map(r => r.placement)).toEqual([2, 1, 3])
  })
  it('a tie stays shared with that option', () => {
    const s = play(short({ tieBreak: 'shared' }), [[1, 1]], [[1, 1]], [MISS], [MISS])
    expect(s).toMatchObject({ phase: 'finished', winner: null })
    expect(shanghaiGame.summarize(s, { totalDarts: [2, 2], totalVisits: [2, 2] }).map(r => r.placement)).toEqual([1, 1])
  })
  it('a tie the bull cannot break is shared after the cap', () => {
    let s = play(short(), [MISS], [MISS], [MISS], [MISS])
    for (let i = 0; i < MAX_EXTRA_ROUNDS; i++) {
      expect(s.phase).toBe('game')
      s = play(s, [MISS], [MISS])
    }
    expect(s).toMatchObject({ phase: 'finished', winner: null })
  })
  it('a solo game ends after the last round', () => {
    const s = play(shanghaiGame.init({ ...cfg, end: 2 }, [{ name: 'A' }]), [[1, 1]], [[2, 1]])
    expect(s).toMatchObject({ phase: 'finished', winner: 0 })
  })
})

describe('a game ended early', () => {
  it('summarize ranks the Shanghai winner first, the rest by score', () => {
    const s = play(
      duo(),
      [[1, 1]],
      [[1, 3]],
      [
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    )
    const r = shanghaiGame.summarize(s, { totalDarts: [4, 1], totalVisits: [2, 1] })
    expect(r.map(x => x.placement)).toEqual([1, 2])
    expect(r[0].stats).toMatchObject({ total: 13, shanghais: 1 })
  })
  it('summarize works on an unfinished game (a forfeit)', () => {
    const s = play(duo(), [[1, 1]], [[1, 3]])
    expect(shanghaiGame.summarize(s, { totalDarts: [1, 1], totalVisits: [1, 1] }).map(r => r.placement)).toEqual([2, 1])
  })
})

describe('replay and views', () => {
  it('the same inputs give the same state', () => {
    const run = () => play(duo(), [[1, 1], MISS, [1, 2]], [[1, 3]], [[2, 2]])
    expect(run()).toEqual(run())
  })
  it('the view names the open visit and who is next', () => {
    const s = shanghaiGame.onBoardEvent(duo(), dart(1, 1)).state
    const v = shanghaiGame.view(s, [])
    expect(v).toMatchObject({
      target: 1,
      hits: { single: true, double: false, treble: false },
      visitScore: 1,
      currentPlayer: 0,
      nextPlayer: 1,
    })
  })
  it('the bull off decides the throwing order', () => {
    const m = shanghaiModule
    expect(m.id).toBe('shanghai')
    expect(m.defaultConfig.bullOff).toBe('off')
  })
})
