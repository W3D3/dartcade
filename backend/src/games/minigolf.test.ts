import { describe, it, expect } from 'vitest'
import { minigolfModule as M, type MinigolfConfig, type MinigolfState } from './minigolf.js'
import type { BoardEvent, Player } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'
import { seededRng } from '../session/rng.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS } from '../shared/minigolf/physics.js'
import type { Pt } from '../shared/minigolf/types.js'

const two: Player[] = [{ name: 'A' }, { name: 'B' }]
const cfg = (over: Partial<MinigolfConfig> = {}): MinigolfConfig => ({ ...M.defaultConfig, course: 'test', ...over })
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
const SEG = { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 } as const
const MISS = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
/** A dart at board coords (r = 1 at the double wire, y up); null is a bounce-out. */
function dart(coords: { x: number; y: number } | null, index = 0): BoardEvent {
  return {
    kind: 'dart.detected',
    data: { visit_id: 'v', index, source_seq: 0, dart: coords ? { segment: SEG, score: 20, coords } : { segment: MISS, score: 0 } },
  }
}
const play = (s: MinigolfState, events: BoardEvent[]) => events.reduce((st, e) => M.onBoardEvent(st, e).state, s)
const visit = (s: MinigolfState, ...darts: BoardEvent[]) => play(s, [opened, ...darts, takeout])
/** The engine's takeout with no darts thrown: three misses. */
const emptyTakeout = (s: MinigolfState) => visit(s, dart(null, 0), dart(null, 1), dart(null, 2))
const at = (s: MinigolfState, seat: number, p: Pt, status: 'playing' | 'waiting' = 'playing'): MinigolfState => ({
  ...s,
  balls: s.balls.map((b, i) => (i === seat ? { ...b, at: p, status } : b)),
})
/** A bull: a soft putt straight at the cup. */
const bull = (i = 0) => dart({ x: 0, y: 0 }, i)
const straight = testCourse.holes[0] // cup at [250, 300]
const nearCup: Pt = [250, 420]

describe('minigolf', () => {
  it('starts everyone waiting on the first tee, with the holes and physics copied in', () => {
    const s = M.init(cfg(), two)
    expect(s.holes).toEqual(testCourse.holes)
    expect(s.physics).toEqual(DEFAULT_PHYSICS)
    expect(s.balls.map(b => [b.at, b.status])).toEqual([
      [straight.tee, 'waiting'],
      [straight.tee, 'waiting'],
    ])
    expect(M.getCurrentPlayer(s)).toBe(0)
  })

  it('draws the same mixed holes for the same seed', () => {
    const a = M.init(cfg({ course: 'mixed' }), two, seededRng(7))
    const b = M.init(cfg({ course: 'mixed' }), two, seededRng(7))
    expect(a.holes.map(h => h.id)).toEqual(b.holes.map(h => h.id))
    expect(a.courseName).toBe('Mixed course')
  })

  it('keeps the last of three tries', () => {
    const s0 = M.init(cfg(), two)
    const darts = [dart({ x: 0, y: 0.3 }, 0), dart({ x: 0.2, y: 0.5 }, 1), dart({ x: 0, y: 0.6 }, 2)]
    const open = play(s0, [opened, ...darts])
    expect(M.view(open, two).tries).toHaveLength(3)
    expect(M.view(open, two).visitLocked).toBe(true)
    const s = M.onBoardEvent(open, takeout).state
    expect(s.balls[0].strokes).toBe(1)
    const third = M.view(open, two).tries[2]
    expect(s.balls[0].at.map(Math.round)).toEqual(third.path.at(-1))
    expect(M.getCurrentPlayer(s)).toBe(1)
  })

  it('takes only the first dart with 1 try', () => {
    const s0 = M.init(cfg({ tries: 1 }), two)
    const one = play(s0, [opened, dart({ x: 0, y: 0.3 })])
    expect(M.view(one, two).visitLocked).toBe(true)
    const two_ = M.onBoardEvent(one, dart({ x: 0.5, y: 0 }, 1)).state
    expect(two_.tries).toHaveLength(1)
  })

  it('counts a takeout without darts as one missed stroke', () => {
    const s = emptyTakeout(M.init(cfg(), two))
    expect(s.balls[0]).toMatchObject({ strokes: 1, at: straight.tee, status: 'playing' })
  })

  it('skips players in the cup', () => {
    let s = M.init(cfg(), two)
    s = visit(at(s, 0, nearCup), bull()) // A holes out
    expect(s.balls[0].status).toBe('holed')
    s = emptyTakeout(s) // B
    expect(M.getCurrentPlayer(s)).toBe(1)
  })

  it('scores max + 1 when the ball is not in by the last stroke', () => {
    let s = M.init(cfg({ maxStrokes: 3 }), [{ name: 'A' }])
    s = emptyTakeout(emptyTakeout(s))
    expect(s.balls[0].status).toBe('playing')
    s = emptyTakeout(s)
    expect(s.scores[0]).toEqual([4])
    expect(s.holeIdx).toBe(1)
  })

  it('ends the hole: scores, the last hole, the best score first, balls back on the tee', () => {
    let s = M.init(cfg(), two)
    s = emptyTakeout(s) // A: 1
    s = visit(at(s, 1, nearCup), bull()) // B holes in 1
    s = visit(at(s, 0, nearCup), bull()) // A holes in 2
    expect(s.scores[0]).toEqual([2, 1])
    expect(s.lastHole).toMatchObject({ index: 0, scores: [2, 1] })
    expect(s.order).toEqual([1, 0])
    expect(M.getCurrentPlayer(s)).toBe(1)
    expect(s.balls.every(b => b.status === 'waiting' && b.at === testCourse.holes[1].tee)).toBe(true)
  })

  it('keeps the order on a tied hole', () => {
    let s = M.init(cfg(), two)
    s = visit(at(s, 0, nearCup), bull())
    s = visit(at(s, 1, nearCup), bull())
    expect(s.order).toEqual([0, 1])
  })

  it('finishes after the last hole; ties share a placement', () => {
    let s = M.init(cfg(), two)
    for (let h = 0; h < testCourse.holes.length; h++) {
      const [cx, cy] = testCourse.holes[h].cup.at
      s = visit(at(s, s.current, [cx, cy + 120]), bull())
      s = visit(at(s, s.current, [cx, cy + 120]), bull())
    }
    expect(s.finished).toBe(true)
    expect(M.view(s, two).winner).toBe(0)
    expect(M.summarize(s, { totalDarts: [], totalVisits: [] }).map(r => r.placement)).toEqual([1, 1])
  })

  it('knocks a ball with contact on; a knocked ball that drops counts', () => {
    let s = M.init(cfg({ ballContact: true }), two)
    s = at(at(s, 1, [250, 420]), 0, [250, 900])
    // Straight up, rolling ~700 mm on its own (power 0.05 + 0.95 r of the 4.5 m full roll)
    s = visit(s, dart({ x: 0, y: (700 / DEFAULT_PHYSICS.maxRoll - DEFAULT_PHYSICS.minPutt) / (1 - DEFAULT_PHYSICS.minPutt) }))
    expect(s.balls[1].status).toBe('holed')
    expect(s.balls[1].strokes).toBe(0)
    expect(s.balls[1].at).toEqual(straight.cup.at)
  })

  it('leaves balls not yet played out of the simulation', () => {
    let s = M.init(cfg({ ballContact: true }), two)
    s = at(s, 1, [250, 520], 'waiting')
    s = at(s, 0, [250, 900])
    s = visit(s, bull())
    expect(s.balls[1].at).toEqual([250, 520])
  })

  it('replays a corrected try from where the visit started', () => {
    const s0 = M.init(cfg(), two)
    const first = [opened, dart({ x: 0, y: 0.5 }, 0), dart({ x: 0.3, y: 0.3 }, 1)]
    const corrected = [opened, dart({ x: 0, y: 0.2 }, 0), dart({ x: 0.3, y: 0.3 }, 1)]
    const a = M.view(refoldVisit(M, s0, first), two).tries[1]
    const b = M.view(refoldVisit(M, s0, corrected), two).tries[1]
    expect(b.path).toEqual(a.path)
  })

  it('counts unplayed holes as max + 1 in an unfinished game', () => {
    let s = M.init(cfg(), two)
    s = visit(at(s, 0, nearCup), bull())
    s = visit(at(s, 1, nearCup), bull())
    const [a] = M.summarize(s, { totalDarts: [], totalVisits: [] })
    expect(a.stats.strokes).toBe(1 + 2 * (M.defaultConfig.maxStrokes + 1))
    expect(a.stats.holesInOne).toBe(1)
  })
})
