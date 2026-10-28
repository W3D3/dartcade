import { describe, it, expect } from 'vitest'
import { hiloGame, hiloModule, judge, compareSeats, type HiloConfig, type HiloState } from './hilo.js'
import type { BoardEvent } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'

const cfg: HiloConfig = {
  startHigh: 41,
  startLow: 21,
  lives: 3,
  t1Zero: false,
  matchExtremes: true,
  keepBarsOnLifeLost: false,
  bullOff: 'off',
}
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: { visit_id: 'v', index, dart: { segment: { name: '', number, bed: '', multiplier }, score: number * multiplier }, source_seq: 1 },
  }) as any
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }

/** Plays visits ([number, multiplier] darts each) through the reducer. */
function play(s: HiloState, ...visits: [number, number][][]): HiloState {
  for (const v of visits) {
    s = hiloGame.onBoardEvent(s, opened).state
    v.forEach(([n, m], i) => (s = hiloGame.onBoardEvent(s, dart(n, m, i)).state))
    s = hiloGame.onBoardEvent(s, takeout).state
  }
  return s
}

const duo = (c: Partial<HiloConfig> = {}) => hiloGame.init({ ...cfg, ...c }, [{ name: 'A' }, { name: 'B' }])
const T20: [number, number] = [20, 3],
  S20: [number, number] = [20, 1],
  S1: [number, number] = [1, 1],
  MISS: [number, number] = [0, 0]

describe('judge', () => {
  it.each([
    [60, 41, 21, true, 'high'],
    [41, 41, 21, true, 'between'],
    [21, 41, 21, true, 'between'],
    [20, 41, 21, true, 'low'],
    [180, 180, 21, true, 'high'],
    [180, 180, 21, false, 'between'],
    [0, 60, 0, true, 'low'],
    [0, 60, 0, false, 'between'],
  ] as const)('%i on %i/%i, extremes %s → %s', (t, high, low, matchExtremes, out) => {
    expect(judge(t, high, low, { ...cfg, matchExtremes })).toBe(out)
  })
})

describe('a visit', () => {
  it('above the high bar sets it', () => {
    const s = play(duo(), [T20, S1, S1]) // 62
    expect(s).toMatchObject({ high: 62, low: 21, currentPlayer: 1 })
    expect(s.visits[0]).toEqual({ seat: 0, round: 1, total: 62, outcome: 'high', high: 62, low: 21 })
  })
  it('below the low bar sets it', () => expect(play(duo(), [S1, S1, [5, 1]]).low).toBe(7))
  it('between costs a life and resets the bars to the start (the default)', () => {
    const s = play(duo(), [S20, [5, 1], [5, 1]]) // 30
    expect(s).toMatchObject({ high: 41, low: 21, lives: [2, 3] })
    expect(s.lastResult).toEqual({ seat: 0, total: 30, outcome: 'between', high: 41, low: 21 })
  })
  it('a life lost resets both bars to the start, even after they moved', () => {
    // A sets the high bar to 62, then B sets the low bar to 7; A then goes between and loses a life
    const s = play(duo(), [T20, S1, S1], [[5, 1], S1, S1], [S20, [5, 1], [5, 1]])
    expect(s).toMatchObject({ high: 41, low: 21, lives: [2, 3] })
  })
  it('keepBarsOnLifeLost keeps the bars where they were', () => {
    const s = play(duo({ keepBarsOnLifeLost: true }), [T20, S1, S1], [S20, [5, 1], [5, 1]])
    expect(s).toMatchObject({ high: 62, low: 21, lives: [3, 2] })
  })
  it('a miss below the high bar costs a life, locks the visit and resets the bars', () => {
    let s = hiloGame.onBoardEvent(duo(), opened).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 0)).state
    s = hiloGame.onBoardEvent(s, dart(0, 0, 1)).state
    expect(s.missed).toBe(true)
    s = hiloGame.onBoardEvent(s, dart(20, 3, 2)).state // ignored
    s = hiloGame.onBoardEvent(s, takeout).state
    expect(s).toMatchObject({ lives: [2, 3], high: 41, low: 21 })
    expect(s.visits[0].outcome).toBe('miss')
  })
  it('a miss already under the low bar still costs a life', () => {
    expect(play(duo(), [S1, MISS, S1]).lives).toEqual([2, 3])
  })
  it('a miss once safe high is harmless', () => {
    const s = play(duo(), [T20, MISS, MISS])
    expect(s).toMatchObject({ high: 60, lives: [3, 3] })
  })
  it('an early takeout: a life unless safe high', () => {
    expect(play(duo(), [S1]).lives).toEqual([2, 3])
    expect(play(duo(), [T20]).high).toBe(60)
  })
  it('T1 counts as 0 with the option', () => {
    expect(
      play(duo({ t1Zero: true, startLow: 1 }), [
        [1, 3],
        [1, 3],
        [1, 3],
      ]).low,
    ).toBe(0)
    expect(play(duo({ startLow: 10 }), [[1, 3], [1, 3], S1]).low).toBe(7)
  })
})

describe('turns and the end', () => {
  it('skips players who are out, rounds count up, the last one in wins', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    let s = play(g, [S20, [5, 1], [5, 1]]) // A out (30 between)
    s = play(s, [T20, S1, S1]) // B 62 high
    expect(s.currentPlayer).toBe(2)
    s = play(s, [S20, S20, S20]) // C 60, between 21 and 62 → out
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })
    expect(s.outAt).toEqual([0, null, 2])
  })
  it('round increments when play wraps', () => {
    const s = play(duo(), [T20, S1, S1], [S1, S1, S1])
    expect(s.round).toBe(2)
  })
  it('compareSeats: in before out, more lives first, later out first', () => {
    const s = { ...duo(), lives: [0, 2, 0, 1], outAt: [3, null, 5, null] }
    const order = [0, 1, 2, 3].sort((a, b) => compareSeats(s, a, b))
    expect(order).toEqual([1, 3, 2, 0])
  })
})

describe('corrections', () => {
  it('correcting the miss into a segment unlocks the visit on refold', () => {
    const start = hiloGame.onBoardEvent(duo(), opened).state
    expect(refoldVisit(hiloGame, duo(), [opened, dart(0, 0, 0)]).missed).toBe(true)
    expect(refoldVisit(hiloGame, duo(), [opened, dart(20, 1, 0)]).missed).toBe(false)
    void start
  })
})

describe('view', () => {
  it('after a high visit sets the bar and leaves winner null', () => {
    const s = play(duo(), [T20, S1, S1]) // 62, high
    const v = hiloGame.view(s, [])
    expect(v).toMatchObject({ high: 62, low: 21, winner: null, visitLocked: false, currentPlayer: 1 })
    expect(v.seats[0]).toMatchObject({ lives: 3, out: false, place: null, outRound: null })
    expect(v.seats[0].visits).toEqual([{ round: 1, total: 62, outcome: 'high' }])
  })

  it('an out seat has out: true and a place, winner stays null while the game goes on', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    const s = play(g, [S20, [5, 1], [5, 1]]) // A out (30, between)
    const v = hiloGame.view(s, [])
    expect(v.winner).toBeNull()
    expect(v.seats[0]).toMatchObject({ out: true, place: 3, outRound: 1 })
    expect(v.seats[1].place).toBeNull()
  })

  it('winner is always present, and the winner gets place 1 once finished', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }])
    const s = play(g, [S20, [5, 1], [5, 1]]) // A out, B is the last one in
    const v = hiloGame.view(s, [])
    expect(v.winner).toBe(1)
    expect(v.seats[1]).toMatchObject({ out: false, place: 1 })
    expect(v.seats[0]).toMatchObject({ out: true, place: 2 })
  })

  it('nextPlayer is null once the open visit would end the game', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }])
    let s = hiloGame.onBoardEvent(g, opened).state
    s = hiloGame.onBoardEvent(s, dart(20, 1, 0)).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 1)).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 2)).state // 30, between: A's last life
    expect(hiloGame.view(s, []).nextPlayer).toBeNull()
  })
})

describe('hiloModule (with a bull off)', () => {
  const two = [{ name: 'A' }, { name: 'B' }]
  it('stages a bull off before the game starts', () => {
    const s = hiloModule.init({ ...cfg, bullOff: 'wdc' }, two)
    expect(s.stage).toBe('bulloff')
  })
})

describe('edge cases', () => {
  it('visit.cleared judges the visit like a takeout', () => {
    let s = hiloGame.onBoardEvent(duo(), opened).state
    s = hiloGame.onBoardEvent(s, dart(20, 3, 0)).state // T20
    s = hiloGame.onBoardEvent(s, dart(1, 1, 1)).state // S1, total 61
    s = hiloGame.onBoardEvent(s, { kind: 'visit.cleared', data: {} }).state
    expect(s.visits[0]).toMatchObject({ total: 61, outcome: 'high' })
    expect(s.currentPlayer).toBe(1)
  })

  it('board events after the game is finished change nothing', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }])
    const finished = play(g, [S20, [5, 1], [5, 1]]) // A out, B wins
    expect(finished.phase).toBe('finished')
    let s = hiloGame.onBoardEvent(finished, opened).state
    expect(s).toEqual(finished)
    s = hiloGame.onBoardEvent(s, dart(20, 3, 0)).state
    expect(s).toEqual(finished)
    s = hiloGame.onBoardEvent(s, takeout).state
    expect(s).toEqual(finished)
  })

  it('a 4th dart after three is ignored, separately from the lock after a miss', () => {
    let s = hiloGame.onBoardEvent(duo(), opened).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 0)).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 1)).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 2)).state // 3 darts, total 15
    const before = s
    s = hiloGame.onBoardEvent(s, dart(20, 3, 3)).state
    expect(s).toEqual(before)
  })

  it('lastResult clears on the next dart', () => {
    let s = play(duo(), [S20, [5, 1], [5, 1]]) // between, life lost: lastResult set
    expect(s.lastResult).not.toBeNull()
    s = hiloGame.onBoardEvent(s, opened).state
    s = hiloGame.onBoardEvent(s, dart(5, 1, 0)).state
    expect(s.lastResult).toBeNull()
  })

  it('a miss on a total of 180 with the high bar at 180 (matchExtremes on) is harmless', () => {
    const s = { ...duo({ startHigh: 180 }), visitTotal: 180, high: 180, visitDarts: 2 }
    const after = hiloGame.onBoardEvent(s, dart(0, 0, 2)).state
    expect(after.missed).toBe(false)
    expect(after.visitTotal).toBe(180)
  })

  it('the round counts up correctly when the player at the wrap point is out', () => {
    const base = hiloGame.init(cfg, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    // C (the wrap point, the last seat in order) is already out; B is up and sets a new high bar.
    const s: HiloState = { ...base, lives: [1, 2, 0], outAt: [null, null, 0], turn: 1, currentPlayer: 1, round: 1, visitTotal: 100 }
    const after = hiloGame.onBoardEvent(s, takeout).state
    expect(after).toMatchObject({ currentPlayer: 0, round: 2 })
  })
})

describe('summarize', () => {
  it('a finished 3-player game: placements by when each went out, plus the exact stats', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    let s = play(g, [S20, [5, 1], [5, 1]]) // A: 30 between -> out, round 1
    s = play(s, [T20, S1, S1]) // B: 62 high
    s = play(s, [S20, S20, S20]) // C: 60 between -> out, round 1; B is the only one left in
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })

    const results = hiloGame.summarize(s, { totalDarts: [3, 3, 3], totalVisits: [1, 1, 1] })
    expect(results[0]).toEqual({
      placement: 3,
      stats: { livesLeft: 0, visits: 1, livesLostBetween: 1, livesLostMiss: 0, dartsThrown: 3, outRound: 1 },
    })
    expect(results[1]).toEqual({
      placement: 1,
      stats: { livesLeft: 1, visits: 1, livesLostBetween: 0, livesLostMiss: 0, dartsThrown: 3, highestSet: 62 },
    })
    expect(results[2]).toEqual({
      placement: 2,
      stats: { livesLeft: 0, visits: 1, livesLostBetween: 1, livesLostMiss: 0, dartsThrown: 3, outRound: 1 },
    })
  })

  it('a forfeit-style unfinished game with no winner: seats still in rank first', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    const s = play(g, [S20, [5, 1], [5, 1]]) // A out (30, between); B and C still in, game goes on
    expect(s).toMatchObject({ phase: 'game', winner: null })

    const results = hiloGame.summarize(s, { totalDarts: [3, 0, 0], totalVisits: [1, 0, 0] })
    expect(results.map(r => r.placement)).toEqual([3, 1, 1])
    expect(results[0].stats).toEqual({ livesLeft: 0, visits: 1, livesLostBetween: 1, livesLostMiss: 0, dartsThrown: 3, outRound: 1 })
    expect(results[1].stats).toEqual({ livesLeft: 1, visits: 0, livesLostBetween: 0, livesLostMiss: 0, dartsThrown: 0 })
    expect(results[2].stats).toEqual({ livesLeft: 1, visits: 0, livesLostBetween: 0, livesLostMiss: 0, dartsThrown: 0 })
  })
})

describe('detail', () => {
  it('a short game', () => {
    const g = hiloGame.init({ ...cfg, lives: 1 }, [{ name: 'A' }, { name: 'B' }])
    const s = play(g, [S20, [5, 1], [5, 1]]) // A: 30 between -> out, B wins
    expect(s).toMatchObject({ phase: 'finished', winner: 1 })

    const d = hiloGame.detail([], s)
    expect(d).toEqual({
      mode: 'hilo',
      start: { high: 41, low: 21 },
      visits: [{ seat: 0, round: 1, total: 30, outcome: 'between', high: 41, low: 21 }],
      seats: [
        { place: 2, outRound: 1, livesLeft: 0 },
        { place: 1, outRound: null, livesLeft: 1 },
      ],
    })
  })
})

describe('matchStats', () => {
  it('visits survived, highest/lowest set, lives lost', () => {
    const g = hiloGame.init({ ...cfg, lives: 2 }, [{ name: 'A' }, { name: 'B' }])
    const s = play(g, [T20, S1, S1], [S20, [5, 1], [5, 1]], [[5, 1], S1, S1]) // A sets high 62; B between (life); A sets low 7
    const m = hiloGame.matchStats!([], s)
    expect(m.rows.map(r => r.key)).toEqual(['visitsSurvived', 'highestSet', 'lowestSet', 'livesLost'])
    const a = m.seats.find(x => x.index === 0)!
    const b = m.seats.find(x => x.index === 1)!
    expect(a.values).toEqual({ visitsSurvived: 2, visits: 2, highestSet: 62, lowestSet: 7, livesLost: 0 })
    expect(b.values).toEqual({ visitsSurvived: 0, visits: 1, livesLost: 1 })
  })
})

describe('validate', () => {
  const two = [{ name: 'A' }, { name: 'B' }]
  it('passes the defaults', () => expect(hiloGame.validate!(hiloGame.defaultConfig, two)).toBeNull())
  it('refuses bad setups', () => {
    expect(hiloGame.validate!(cfg, [{ name: 'A' }])).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startLow: 41 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, startHigh: 181 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: 8 }, two)).not.toBeNull()
    expect(hiloGame.validate!({ ...cfg, lives: '3' as unknown as number }, two)).not.toBeNull()
    // The bull off is the wrapper's to check
    expect(hiloModule.validate!({ ...cfg, bullOff: 'bdo' as HiloConfig['bullOff'] }, two)).toBe('Unknown bull off')
  })
})
