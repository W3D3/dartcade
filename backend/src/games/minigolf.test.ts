import { afterEach, describe, it, expect } from 'vitest'
import { minigolfModule as M, type MinigolfConfig, type MinigolfState } from './minigolf.js'
import type { BoardEvent, Player } from '../session/types.js'
import { refoldVisit } from '../session/refold.js'
import { seededRng } from '../session/rng.js'
import { testCourse } from '../shared/minigolf/courses/test.js'
import { DEFAULT_PHYSICS } from '../shared/minigolf/physics.js'
import type { Hole, Pt } from '../shared/minigolf/types.js'
import { courseSource, setCourseSource, type CourseSource } from './minigolfCourseSource.js'
import { InvalidConfigError } from '../session/errors.js'

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
const nextHole = (s: MinigolfState) => M.onUserAction(s, { type: 'minigolf_next_hole' }).state
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

  it('replays a game stored with the old flat physics in 3D', () => {
    // The 2D engine is gone: such a game's config still has physics '2d', and its ballPhysics the 2D cup's settings
    const old = { ...cfg(), physics: '2d', ballPhysics: { ...DEFAULT_PHYSICS, cupPull: 6000, dropTime: 0.045 } } as MinigolfConfig
    expect(M.validate!(old, two)).toBeNull()
    const s = M.init(old, two)
    expect(s.cfg).not.toHaveProperty('physics')
    expect(visit(s, bull()).balls[0].paths[0].every(p => p.length === 3)).toBe(true)
  })

  it('refuses option values it does not offer and a fractional stroke cap', () => {
    expect(M.validate!(cfg({ tries: 2 as 3 }), two)).toBe('Unknown darts per stroke')
    expect(M.validate!(cfg({ tries: '3' as unknown as 3 }), two)).toBe('Unknown darts per stroke')
    expect(M.validate!(cfg({ aimAssist: 'yes' as unknown as boolean }), two)).toBe('Unknown aim assist')
    expect(M.validate!(cfg({ maxStrokes: 4.5 }), two)).toBe('Max strokes must be between 3 and 10')
    expect(M.validate!({ ...cfg(), shotPreview: undefined } as unknown as MinigolfConfig, two)).toBeNull()
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
    expect(s.balls[0].at.map(Math.round)).toEqual(third.path.at(-1)?.slice(0, 2))
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

  it('waits between holes until the host moves on: darts and takeouts change nothing meanwhile', () => {
    let s = M.init(cfg(), [{ name: 'A' }])
    s = visit(at(s, 0, nearCup), bull())
    expect(s.holeIdx).toBe(1)
    expect(M.view(s, [{ name: 'A' }]).paused).toBe(true)
    expect(M.view(s, [{ name: 'A' }]).visitLocked).toBe(true)
    expect(visit(s, bull())).toBe(s)
    s = nextHole(s)
    expect(M.view(s, [{ name: 'A' }]).paused).toBe(false)
    expect(visit(s, bull()).balls[0].strokes).toBe(1)
    // Moving on when not paused changes nothing
    expect(nextHole(s)).toBe(s)
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
      // The last hole ends the game without a pause
      if (h < testCourse.holes.length - 1) s = nextHole(s)
    }
    expect(s.finished).toBe(true)
    expect(M.view(s, two).paused).toBe(false)
    expect(M.view(s, two).winner).toBe(0)
    expect(M.summarize(s, { totalDarts: [], totalVisits: [] }).map(r => r.placement)).toEqual([1, 1])
  })

  it('knocks a ball with contact on; a knocked ball that drops counts', () => {
    let s = M.init(cfg({ ballContact: true }), two)
    s = at(at(s, 1, [250, 420]), 0, [250, 900])
    // Straight up, rolling ~700 mm on its own: power = minPutt + (1 − minPutt) · r^powerExponent of the full roll
    const { maxRoll, minPutt, powerExponent } = DEFAULT_PHYSICS
    s = visit(s, dart({ x: 0, y: ((700 / maxRoll - minPutt) / (1 - minPutt)) ** (1 / powerExponent) }))
    expect(s.balls[1].status).toBe('holed')
    expect(s.balls[1].strokes).toBe(0)
    expect(Math.hypot(s.balls[1].at[0] - straight.cup.at[0], s.balls[1].at[1] - straight.cup.at[1])).toBeLessThan(straight.cup.r)
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
    expect(a.stats.strokes).toBe(1 + (testCourse.holes.length - 1) * (M.defaultConfig.maxStrokes + 1))
    expect(a.stats.holesInOne).toBe(1)
  })

  it('hides tries without shot preview until the darts are used up or pulled', () => {
    const s0 = M.init(cfg({ shotPreview: false }), two)
    const one = play(s0, [opened, dart({ x: 0, y: 0.3 })])
    const v1 = M.view(one, two)
    expect(v1.shotHidden).toBe(true)
    expect(v1.tries[0]).toMatchObject({ label: 'S20', path: [], holed: false })
    expect(v1.tries[0].power).toBeGreaterThan(0)
    const three = play(one, [dart({ x: 0, y: 0.3 }, 1), dart({ x: 0, y: 0.3 }, 2)])
    expect(M.view(three, two).shotHidden).toBe(false)
    expect(M.view(three, two).tries[2].path.length).toBeGreaterThan(1)
    const kept = M.onBoardEvent(one, takeout).state
    expect(M.view(kept, two).lastStroke).toMatchObject({ hole: 0, seat: 0, stroke: 1 })
    expect(M.view(kept, two).lastStroke?.path.at(-1)?.slice(0, 2)).toEqual(kept.balls[0].at.map(Math.round))
  })

  it('shows a straight aim line, not simulated, with shot preview until the stroke is kept', () => {
    const one = play(M.init(cfg({ shotPreview: true }), two), [opened, dart({ x: 0, y: 0.3 })])
    const v = M.view(one, two)
    expect(v.shotHidden).toBe(true)
    const t = v.tries[0]
    expect(t.path).toEqual([])
    expect(t.aim).not.toBeNull()
    expect(t.aim?.roll).toBeCloseTo((t.power ?? 0) * DEFAULT_PHYSICS.maxRoll)
    const [dx, dy] = t.aim?.dir ?? [0, 0]
    expect(Math.hypot(dx, dy)).toBeCloseTo(1)
    // Once the tries are used up they're revealed, and the aim line stays until the stroke is kept (Shoot)
    const three = M.view(play(one, [dart({ x: 0, y: 0.3 }, 1), dart({ x: 0, y: 0.3 }, 2)]), two)
    expect(three.tries[2].path.length).toBeGreaterThan(1)
    expect(three.tries[2].aim).not.toBeNull()
    // Without shot preview, no line at all
    const off = M.view(play(M.init(cfg({ shotPreview: false }), two), [opened, dart({ x: 0, y: 0.3 })]), two)
    expect(off.tries[0].aim).toBeNull()
    // A miss carries no direction to aim with
    const missed = M.view(play(M.init(cfg({ shotPreview: true }), two), [opened, dart(null)]), two)
    expect(missed.tries[0].aim).toBeNull()
  })

  it('pulls a short putt near the cup line with aim assist, not without', () => {
    // The straight hole teed up 250 mm below its cup, inside the assist's range; the dart a
    // little right of straight up
    const close: Hole = { ...straight, tee: [straight.cup.at[0], straight.cup.at[1] + 250] }
    const nearly = dart({ x: 0.02, y: 0.3 })
    const assisted = visit(M.init(cfg({ aimAssist: true, holes: [close] }), two), nearly)
    const plain = visit(M.init(cfg({ aimAssist: false, holes: [close] }), two), nearly)
    // Where it stops depends on the bounce; the assisted putt ends far nearer the line
    const off = (at: Pt) => Math.abs(at[0] - close.tee[0])
    expect(off(plain.balls[0].at)).toBeGreaterThan(10)
    expect(off(assisted.balls[0].at)).toBeLessThan(off(plain.balls[0].at) / 4)
  })

  it('leaves a long putt to the player, even with aim assist', () => {
    const nearly = dart({ x: 0.03, y: 0.5 })
    const assisted = visit(M.init(cfg({ aimAssist: true }), two), nearly)
    const plain = visit(M.init(cfg({ aimAssist: false }), two), nearly)
    expect(assisted.balls[0].at).toEqual(plain.balls[0].at)
  })

  it('plays a config saved before an option existed with its default', () => {
    const { aimAssist: _a, shotPreview: _p, ...old } = cfg()
    const s = M.init(old as MinigolfConfig, two)
    expect(s.cfg).toMatchObject({ aimAssist: true, shotPreview: false })
  })

  it("details every hole's shapes and each seat's shot paths in 2D, the open hole's too", () => {
    const s0 = M.init(cfg(), [{ name: 'A' }])
    const s1 = visit(at(s0, 0, nearCup), bull()) // holes out on hole 1
    const s2 = emptyTakeout(nextHole(s1)) // one miss on hole 2, then forfeited
    const record = (start: MinigolfState, after: MinigolfState) => ({
      visit: 0,
      seat: 0,
      leg: 0,
      phase: 'game' as const,
      committedAt: '2026-10-01T10:00:00.000Z',
      darts: [],
      start,
      end: start,
      after,
    })
    const d = M.detail([record(s0, s1), record(s1, s2)], s2)
    const [first, second, third] = d.holes
    expect(first).toMatchObject({ name: straight.name, outline: straight.outline, cup: straight.cup })
    expect(first.paths).toHaveLength(1)
    expect(first.paths[0]).toHaveLength(1)
    expect(first.paths[0][0].length).toBeGreaterThan(1)
    expect(first.paths[0][0].every(p => p.length === 2 && p.every(Number.isInteger))).toBe(true)
    expect(second.paths).toEqual([[[testCourse.holes[1].tee]]])
    expect(third.paths).toEqual([[]])
  })
})

describe('minigolf courses from the course source', () => {
  const code = courseSource()
  afterEach(() => setCourseSource(code))
  const hole = (id: string): Hole => ({ ...straight, id })
  const pool = (n: number) => Array.from({ length: n }, (_, i) => hole(`h${i}`))
  const use = (officialHoles: Hole[], courses: Record<string, { name: string; holes: Hole[] }> = {}) =>
    setCourseSource({
      course: id => Promise.resolve(courses[id]),
      officialHoles: () => Promise.resolve(officialHoles),
      officialCourses: () => Promise.resolve(Object.entries(courses).map(([id, c]) => ({ id, name: c.name }))),
    } satisfies CourseSource)

  it('fills in the course name and holes, over any the config brings along', async () => {
    use([], { c1: { name: 'Canal Street', holes: testCourse.holes } })
    const out = await M.prepareConfig!(cfg({ course: 'c1', holes: [hole('injected')], courseName: 'Fake' }), seededRng(1))
    expect(out.holes).toEqual(testCourse.holes)
    expect(out.courseName).toBe('Canal Street')
    expect(out.tries).toBe(3)
    expect(out.ballPhysics).toEqual(DEFAULT_PHYSICS)
  })

  it('plays the physics stored with the game, the defaults for a game stored before them', () => {
    const slow = { ...DEFAULT_PHYSICS, friction: 2400 }
    expect(M.init(cfg({ ballPhysics: slow }), two).physics).toEqual(slow)
    expect(M.init(cfg(), two).physics).toEqual(DEFAULT_PHYSICS)
    expect(M.init(cfg({ ballPhysics: slow }), two).cfg).not.toHaveProperty('ballPhysics')
  })

  it('picks 9 of the official holes for the mixed course with the given rng, or all if fewer', async () => {
    use(pool(12))
    const a = await M.prepareConfig!(cfg({ course: 'mixed' }), seededRng(5))
    const b = await M.prepareConfig!(cfg({ course: 'mixed' }), seededRng(5))
    expect(a.holes).toHaveLength(9)
    expect(new Set(a.holes!.map(h => h.id)).size).toBe(9)
    expect(a.holes).toEqual(b.holes)
    expect(a.courseName).toBe('Mixed course')
    use(pool(4))
    expect((await M.prepareConfig!(cfg({ course: 'mixed' }), seededRng(5))).holes).toHaveLength(4)
  })

  it('refuses a course that is unknown, unpublished or has no holes', async () => {
    use([], { empty: { name: 'Empty', holes: [] } })
    await expect(M.prepareConfig!(cfg({ course: 'nope' }), seededRng(1))).rejects.toThrow(InvalidConfigError)
    await expect(M.prepareConfig!(cfg({ course: 'empty' }), seededRng(1))).rejects.toThrow(InvalidConfigError)
    await expect(M.prepareConfig!(cfg({ course: 'mixed' }), seededRng(1))).rejects.toThrow(InvalidConfigError)
  })

  it('plays the holes in the config; an old config without them plays the code course', () => {
    const s = M.init(cfg({ course: 'c1', holes: [hole('a'), hole('b')], courseName: 'Canal Street' }), two)
    expect(s.holes.map(h => h.id)).toEqual(['a', 'b'])
    expect(s.courseName).toBe('Canal Street')
    expect(s.cfg).not.toHaveProperty('holes')
    const old = M.init(cfg({ course: 'test' }), two)
    expect(old.holes).toEqual(testCourse.holes)
    expect(old.courseName).toBe(testCourse.name)
  })

  it('takes any course id at setup (the course is checked at start), but not an empty one', () => {
    expect(M.validate!(cfg({ course: 'made-in-the-editor' }), two)).toBeNull()
    expect(M.validate!(cfg({ course: '' }), two)).toBe('Unknown course')
  })

  it('offers the official courses plus Mixed', async () => {
    use([], { c1: { name: 'Canal Street', holes: [] }, c2: { name: 'Mesa', holes: [] } })
    expect(await M.liveOptions!('course')).toEqual([
      { value: 'c1', label: 'Canal Street' },
      { value: 'c2', label: 'Mesa' },
      { value: 'mixed', label: 'Mixed course' },
    ])
    expect(await M.liveOptions!('tries')).toBeNull()
  })
})
