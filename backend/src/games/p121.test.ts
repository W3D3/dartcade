import { describe, it, expect } from 'vitest'
import {
  p121Game,
  p121Module,
  nextTarget,
  dartLabel,
  compareSeats,
  type P121Config,
  type P121State,
  type P121Seat,
  type P121Try,
} from './p121.js'
import type { BoardEvent } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'

const cfg: P121Config = { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double', missRule: 'reset', lock: false, bullOff: 'off' }
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: P121State, ...visits: [number, number][][]): P121State {
  for (const v of visits) {
    s = p121Game.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = p121Game.onBoardEvent(s, dart(n, m, i)).state))
    s = p121Game.onBoardEvent(s, takeout).state
  }
  return s
}
const solo = (c: Partial<P121Config> = {}) => p121Game.init({ ...cfg, ...c }, [{ name: 'A' }])
const T20: [number, number] = [20, 3],
  MISS: [number, number] = [0, 0]
const miss3 = [MISS, MISS, MISS]

describe('nextTarget', () => {
  it.each([
    ['reset', false, 125, 3, 121],
    ['down', false, 125, 9, 124],
    ['down', false, 121, 9, 121],
    ['stay', false, 125, 9, 125],
    ['reset', true, 125, 7, 126],
  ] as const)('%s, made %s, target %i in %i darts → %i', (missRule, made, target, darts, next) => {
    expect(nextTarget({ target, made, darts }, { ...cfg, missRule }, 121).target).toBe(next)
  })
  it('a 3-dart checkout locks the floor; a miss drops only to it', () => {
    const lockCfg = { ...cfg, lock: true }
    const made = nextTarget({ target: 124, made: true, darts: 3 }, lockCfg, 121)
    expect(made).toEqual({ target: 125, floor: 124 })
    expect(nextTarget({ target: 125, made: false, darts: 9 }, lockCfg, made.floor)).toEqual({ target: 124, floor: 124 })
  })
  it('no lock without the option or above 3 darts', () => {
    expect(nextTarget({ target: 124, made: true, darts: 3 }, cfg, 121).floor).toBe(121)
    expect(nextTarget({ target: 124, made: true, darts: 4 }, { ...cfg, lock: true }, 121).floor).toBe(121)
  })
})

describe('a try', () => {
  it('checks out 121 (T20, T11, D14 → next 122)', () => {
    const s = play(solo(), [T20, [11, 3], [14, 2]])
    expect(s.seats[0].tries).toEqual([{ target: 121, made: true, darts: 3, finish: 'D14' }])
    expect(s.seats[0]).toMatchObject({ target: 122, left: 122 })
    expect(s.lastResult).toEqual({ seat: 0, target: 121, made: true, darts: 3, next: 122 })
  })
  it('a checkout on dart 2 of visit 2 uses 5 darts', () => {
    const s = play(
      solo(),
      [T20, [1, 1], MISS],
      [
        [20, 2],
        [10, 2],
      ],
    ) // 60 left: D20, D10
    expect(s.seats[0].tries[0]).toMatchObject({ made: true, darts: 5 })
  })
  it('three visits without a checkout miss and go back to the start', () => {
    const s = play(solo({ missRule: 'down' }), [T20, [11, 3], [14, 2]], miss3, miss3, miss3)
    expect(s.seats[0].tries[1]).toEqual({ target: 122, made: false, darts: 9, finish: null })
    expect(s.seats[0].target).toBe(121)
  })
  it('a bust resets to the visit start and ends the visit, the try goes on', () => {
    // T20, T20 leaves 1: a dead end under double out
    let s = play(solo(), [T20, T20])
    expect(s.seats[0]).toMatchObject({ left: 121, darts: 3, visits: [0] })
    // 41 left, then T20 goes below 0; the dart after it scores nothing
    s = play(
      solo(),
      [T20, [20, 1], MISS],
      [
        [20, 3],
        [1, 1],
      ],
    )
    expect(s.seats[0]).toMatchObject({ left: 41, darts: 6, visits: [80, 0] })
  })
  it('counts attempts and hits per finishing double', () => {
    const s = play(solo(), [T20, [11, 3], [14, 1]], [[7, 2], MISS, MISS])
    expect(s.seats[0].attempts).toEqual({ D14: 1, D7: 1 })
    expect(s.seats[0].hits).toEqual({ D7: 1 })
  })
  it('above 170 there is no hint and no attempt', () => {
    const s = play(solo({ startTarget: 171 }), [MISS, MISS, MISS])
    expect(s.seats[0].attempts).toEqual({})
  })
  it('a checkout mid-visit ends it; the leftover darts in it are not counted', () => {
    const s = play(solo({ startTarget: 40 }), [[20, 2], MISS, MISS]) // D20 finishes on dart 1
    expect(s.seats[0].tries[0]).toMatchObject({ made: true, darts: 1 })
  })
  it('under master out, the hit and finish are the dart that actually checked out', () => {
    // 30 left: the hint is D15, but T10 also finishes under master out
    const s = play(solo({ startTarget: 30, outMode: 'master' }), [[10, 3]])
    expect(s.seats[0].tries[0]).toMatchObject({ made: true, finish: 'T10' })
    expect(s.seats[0].attempts).toEqual({ D15: 1 })
    expect(s.seats[0].hits).toEqual({ T10: 1 })
  })
})

describe('compareSeats', () => {
  const seat = (tries: P121Try[]): P121Seat => ({ tries, target: 0, left: 0, darts: 0, visits: [], floor: 121, attempts: {}, hits: {} })
  it('more checkouts beats fewer darts, even when the total is higher', () => {
    const made = (darts: number): P121Try => ({ target: 121, made: true, darts, finish: 'D14' })
    const twoCheckouts = seat([made(3), made(3)]) // 2 checkouts, 6 darts
    const oneCheckout = seat([made(2)]) // 1 checkout, 2 darts
    expect(compareSeats(twoCheckouts, oneCheckout)).toBeLessThan(0)
  })
})

it('with 3 darts per try one missed visit ends the try', () => {
  const s = play(solo({ dartsPerTry: 3 }), [T20, MISS, MISS])
  expect(s.seats[0].tries).toEqual([{ target: 121, made: false, darts: 3, finish: null }])
  expect(s.seats[0]).toMatchObject({ target: 121, left: 121, darts: 0 })
})

describe('turns', () => {
  const duo = () => p121Game.init({ ...cfg, tries: 1 }, [{ name: 'A' }, { name: 'B' }])
  it('rotates per visit; a finished seat is skipped; the game ends when all are done', () => {
    let s = play(duo(), [T20, [11, 3], [14, 2]]) // A makes 121 in 3: A is done (1 try)
    expect(s.currentPlayer).toBe(1)
    s = play(s, miss3)
    expect(s.currentPlayer).toBe(1) // A is done, B goes again
    s = play(s, miss3, miss3)
    expect(s.phase).toBe('finished')
    expect(s.winner).toBe(0)
  })
  it('ties go to more checkouts, then fewer darts, then the lower seat', () => {
    let s = p121Game.init({ ...cfg, tries: 1 }, [{ name: 'A' }, { name: 'B' }])
    s = play(s, [T20, [11, 3], MISS], [T20, [11, 3], [14, 2]], [[14, 2]]) // A: 28 left; B makes 121 in 3; A makes it in 4
    expect(s.winner).toBe(1)
  })
  it('an exact tie goes to the lower seat index', () => {
    let s = p121Game.init({ ...cfg, tries: 1 }, [{ name: 'A' }, { name: 'B' }])
    s = play(s, [T20, [11, 3], [14, 2]], [T20, [11, 3], [14, 2]]) // both make 121 in 3
    expect(s.winner).toBe(0)
  })
  it('ignores a takeout once the game is finished', () => {
    const s = play(solo({ tries: 1 }), [T20, [11, 3], [14, 2]])
    expect(s.phase).toBe('finished')
    expect(p121Game.onBoardEvent(s, takeout).state).toEqual(s)
  })
})

describe('corrections', () => {
  it('refolding the open visit after a corrected checkout dart gives the old try back', () => {
    const start = play(solo(), [T20, [11, 3], MISS])
    const events: BoardEvent[] = [opened, dart(14, 2, 0)]
    expect(refoldVisit(p121Game, start, events).seats[0].left).toBe(0)
    const corrected: BoardEvent[] = [opened, dart(14, 1, 0)]
    expect(refoldVisit(p121Game, start, corrected).seats[0].left).toBe(14)
  })
})

it('dartLabel', () => {
  expect([
    dartLabel({ number: 50, multiplier: 1 }),
    dartLabel({ number: 25, multiplier: 1 }),
    dartLabel({ number: 12, multiplier: 2 }),
  ]).toEqual(['Bull', '25', 'D12'])
})

describe('view', () => {
  it('shows the open try, the ladder and the session numbers', () => {
    const s = play(solo(), [T20, [11, 3], [14, 2]], miss3)
    const v = p121Game.view(s, [{ name: 'A' }])
    expect(v.seats[0]).toMatchObject({ target: 122, left: 122, darts: 3, made: 1, highestMade: 121, avgDarts: 3, done: false })
    expect(v.seats[0].tries).toHaveLength(1)
    expect(v).toMatchObject({ currentPlayer: 0, nextPlayer: 0, winner: null, visitLocked: false, phase: 'game' })
  })
  it('locks the visit after a checkout or a bust', () => {
    let s = p121Game.onBoardEvent(solo(), opened).state
    s = p121Game.onBoardEvent(s, dart(20, 3)).state
    s = p121Game.onBoardEvent(s, dart(20, 3, 1)).state
    expect(p121Game.view(s, [{ name: 'A' }]).visitLocked).toBe(true)
  })
})

describe('give up', () => {
  it('ends the open try as missed, counts its darts, and passes the turn', () => {
    let s = p121Game.init(cfg, [{ name: 'A' }, { name: 'B' }])
    s = play(s, [T20, MISS, MISS]) // A: 61 left, 3 darts
    s = play(s, miss3, [MISS, MISS, MISS]) // B, then A again
    s = play(s, miss3) // B
    s = p121Game.onUserAction(s, { type: 'p121_give_up' }).state // A, between visits
    expect(s.seats[0].tries[0]).toEqual({ target: 121, made: false, darts: 6, finish: null })
    expect(s.seats[0].target).toBe(121)
    expect(s.currentPlayer).toBe(1)
  })
  it('is refused while darts are in the open visit', () => {
    let s = p121Game.onBoardEvent(solo(), opened).state
    s = p121Game.onBoardEvent(s, dart(20, 1)).state
    expect(p121Game.onUserAction(s, { type: 'p121_give_up' }).state).toBe(s)
    s = p121Game.onBoardEvent(s, takeout).state
    s = p121Game.onUserAction(s, { type: 'p121_give_up' }).state
    expect(s.seats[0].tries).toEqual([{ target: 121, made: false, darts: 3, finish: null }])
  })
  it('is a no-op once the visit is locked (a checkout waiting for takeout)', () => {
    let s = p121Game.onBoardEvent(solo(), opened).state
    s = p121Game.onBoardEvent(s, dart(20, 3)).state
    s = p121Game.onBoardEvent(s, dart(11, 3, 1)).state // not yet 0, still live
    expect(p121Game.view(s, [{ name: 'A' }]).visitLocked).toBe(false)
    s = p121Game.onBoardEvent(s, dart(14, 2, 2)).state // checks out 121, now locked
    expect(p121Game.onUserAction(s, { type: 'p121_give_up' }).state).toEqual(s)
  })
})

describe('validate', () => {
  const one = [{ name: 'A' }]
  it('passes the defaults', () => {
    expect(p121Module.validate!(p121Module.defaultConfig, one)).toBeNull()
  })
  it('takes 3 darts per try', () => {
    expect(p121Module.validate!({ ...cfg, dartsPerTry: 3 }, one)).toBeNull()
  })
  it('rejects a value that is not one of the options', () => {
    expect(p121Module.validate!({ ...cfg, tries: 0 }, one)).toBe('Unknown tries')
    expect(p121Module.validate!({ ...cfg, dartsPerTry: 7 }, one)).toBe('Unknown darts per try')
    expect(p121Module.validate!({ ...cfg, startTarget: '121' as unknown as number }, one)).toBe('Unknown start target')
    expect(p121Module.validate!({ ...cfg, outMode: 'triple' as 'double' }, one)).toBe('Unknown check-out')
  })
})

it('p121Module starts with the bull off order', () => {
  const s = p121Module.init({ ...cfg, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
  expect(s.stage).toBe('bulloff')
})

describe('history', () => {
  const s0 = play(solo(), [T20, [11, 3], [14, 2]], [T20, [14, 3], [10, 2]], miss3, miss3, miss3, [T20, [11, 3], [14, 2]])
  // tries: 121 made (3), 122 made (3), 123 missed (9), 121 made (3); open target 122
  it('summarize', () => {
    expect(p121Game.summarize(s0, { totalDarts: [18], totalVisits: [6] })).toEqual([
      { placement: 1, stats: { highestMade: 122, checkouts: 3, tries: 4, avgDarts: 3, bestRun: 2 } },
    ])
  })
  it('summarize places seats without a winner (forfeit before the end)', () => {
    const duo = play(p121Game.init(cfg, [{ name: 'A' }, { name: 'B' }]), miss3)
    const r = p121Game.summarize(duo, { totalDarts: [3, 0], totalVisits: [1, 0] })
    expect(r.map(x => x.placement)).toEqual([1, 1])
    expect(r[0].stats).not.toHaveProperty('highestMade')
  })
  it('detail', () => {
    const d = p121Game.detail([], s0)
    expect(d.seats[0]).toMatchObject({
      highestReached: 123,
      bestRun: { length: 2, from: 121, to: 122 },
      fastest: { darts: 3, target: 122 },
      dartsPerCheckout: [{ darts: 3, count: 3 }],
    })
    expect(d.seats[0].doubles[0]).toEqual({ label: 'D14', hits: 2, attempts: 2 })
  })
})
