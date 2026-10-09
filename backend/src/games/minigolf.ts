// Minigolf: your dart is the putter. Everyone plays the same hole, one stroke per visit; with 3
// tries every dart of the visit replays the stroke from the same spot and takeout keeps the last.
// Design: docs/superpowers/specs/2026-10-10-minigolf-game-design.md
import type { BoardEvent, ConfigFieldMeta, GameModule, MinigolfDetail, Player, SeatResult } from '../session/types.js'
import type { MinigolfView } from '../session/views.js'
import type { Rng } from '../session/rng.js'
import { COURSES, getCourse, mixedHoles } from '../shared/minigolf/courses/index.js'
import { DEFAULT_PHYSICS, type Physics } from '../shared/minigolf/physics.js'
import { shotFromDart } from '../shared/minigolf/shot.js'
import type { Hole, OtherBall, Pt, ShotResult } from '../shared/minigolf/types.js'
import { cachedShot } from './minigolfShots.js'
import { row, values } from './matchStats.js'
import { rankSeats } from './ranking.js'

export type MinigolfConfig = {
  /** A course id, or 'mixed' for 9 random holes of all courses. */
  course: string
  tries: 1 | 3
  maxStrokes: number
  ballContact: boolean
  /** Seconds the match screen waits for another dart before the ball rolls (presentation only). */
  shotDelay: number
}

/** `waiting`: not putted yet on this hole (the ball is in hand, not on the felt). */
export type BallStatus = 'waiting' | 'playing' | 'holed' | 'done'
type BallState = { at: Pt; strokes: number; status: BallStatus; paths: Pt[][] }
type Try = { label: string; coords: { x: number; y: number } | null; power: number | null; result: ShotResult | null }

export type MinigolfState = {
  cfg: MinigolfConfig
  courseName: string
  /** Copied in at the start, so later course edits can't change how this game replays. */
  holes: Hole[]
  /** Likewise the physics. */
  physics: Physics
  holeIdx: number
  /** Seats in turn order on this hole. */
  order: number[]
  /** The seat whose turn it is. */
  current: number
  balls: BallState[]
  /** Strokes per hole and seat, written when a hole ends. */
  scores: (number | null)[][]
  /** Where the balls lay when the open visit started: every try starts from here. */
  visitStart: Pt[] | null
  tries: Try[]
  lastHole: { index: number; scores: number[]; paths: Pt[][][] } | null
  finished: boolean
  playerCount: number
}

const configMeta: Record<string, ConfigFieldMeta> = {
  course: {
    label: 'Course',
    options: [...COURSES.map(c => ({ value: c.id, label: c.name })), { value: 'mixed', label: 'Mixed course' }],
  },
  tries: {
    label: 'Darts per stroke',
    tooltip: 'A new dart replaces your last shot. Pull the darts to keep it.',
    options: [
      { value: 3, label: '3 tries' },
      { value: 1, label: '1 dart' },
    ],
  },
  maxStrokes: { label: 'Max strokes per hole', tooltip: 'Not in the cup by then: the hole counts one more.' },
  ballContact: {
    label: 'Ball contact',
    tooltip: 'Balls can knock each other; a ball knocked into the cup counts.',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
  shotDelay: {
    label: 'Shot delay',
    tooltip: 'The ball rolls once no new dart has landed for this long, so you see the shot play out before you pull the darts.',
  },
}

// The view carries points as plain [x, y] arrays (the snapshot schema's MinigolfPt)
type ViewPt = number[]
const pt = (p: Pt): ViewPt => [p[0], p[1]]
const roundPt = (p: Pt): ViewPt => [Math.round(p[0]), Math.round(p[1])]
const roundPath = (path: readonly Pt[]): ViewPt[] => path.map(roundPt)

function holeView(h: Hole): MinigolfView['hole'] {
  return {
    id: h.id,
    name: h.name,
    par: h.par,
    outline: h.outline.map(pt),
    walls: h.walls.map(w => ({ ...w, points: w.points.map(pt) })),
    bumpers: h.bumpers.map(b => ({ ...b, at: pt(b.at) })),
    slopes: h.slopes.map(sl =>
      'force' in sl
        ? { area: sl.area.map(pt), force: pt(sl.force) }
        : { area: sl.area.map(pt), radial: { center: pt(sl.radial.center), strength: sl.radial.strength } },
    ),
    tee: pt(h.tee),
    cup: { at: pt(h.cup.at), r: h.cup.r },
  }
}

/** A hole's score for a seat: its strokes if it's in the cup, else one more than the maximum. */
function holeScore(b: BallState, cfg: MinigolfConfig): number {
  return b.status === 'holed' ? b.strokes : cfg.maxStrokes + 1
}

/** Strokes on the holes a seat finished. */
function playedStrokes(s: MinigolfState, seat: number): number {
  return s.scores.reduce((sum, row) => sum + (row[seat] ?? 0), 0)
}

/** Strokes so far: written scores, plus the maximum + 1 for every hole not played (forfeits). */
function totalsWithUnplayed(s: MinigolfState): number[] {
  return Array.from({ length: s.playerCount }, (_, seat) => s.scores.reduce((sum, row) => sum + (row[seat] ?? s.cfg.maxStrokes + 1), 0))
}

function totals(s: MinigolfState): number[] {
  return Array.from({ length: s.playerCount }, (_, seat) => s.scores.reduce((sum, row) => sum + (row[seat] ?? 0), 0))
}

function toPar(s: MinigolfState): number[] {
  const par = s.holes.reduce((sum, h, i) => sum + (s.scores[i].every(v => v !== null) ? h.par : 0), 0)
  return totals(s).map(t => t - par)
}

function freshBalls(hole: Hole, n: number): BallState[] {
  return Array.from({ length: n }, () => ({ at: hole.tee, strokes: 0, status: 'waiting' as const, paths: [] }))
}

const inPlay = (b: BallState) => b.status === 'waiting' || b.status === 'playing'

/** The try a dart makes from where the balls lay at the start of the visit. */
function playTry(s: MinigolfState, data: Extract<BoardEvent, { kind: 'dart.detected' }>['data']): Try {
  const start = s.visitStart ?? s.balls.map(b => b.at)
  const hole = s.holes[s.holeIdx]
  const ball = start[s.current]
  const coords = data.dart.coords ?? null
  const shot = shotFromDart(coords, ball, hole.cup.at, s.physics)
  const others: OtherBall[] = s.cfg.ballContact
    ? s.balls.flatMap((b, seat) => (seat !== s.current && b.status === 'playing' ? [{ id: seat, at: start[seat] }] : []))
    : []
  return {
    label: data.dart.segment.name,
    coords,
    power: shot?.power ?? null,
    result: shot ? cachedShot(hole, s.physics, ball, shot, others) : null,
  }
}

/** The hole is over: write the scores, then the next hole (or the end). */
function endHole(s: MinigolfState): MinigolfState {
  const holeScores = s.balls.map(b => holeScore(b, s.cfg))
  const scores = s.scores.map((row, i) => (i === s.holeIdx ? holeScores : row))
  const lastHole = { index: s.holeIdx, scores: holeScores, paths: s.balls.map(b => b.paths) }
  if (s.holeIdx === s.holes.length - 1) return { ...s, scores, lastHole, finished: true }
  // Best score on the hole tees off first; ties keep their order (sort is stable)
  const order = [...s.order].sort((a, b) => holeScores[a] - holeScores[b])
  const holeIdx = s.holeIdx + 1
  return { ...s, scores, lastHole, holeIdx, order, current: order[0], balls: freshBalls(s.holes[holeIdx], s.playerCount) }
}

/** Takeout: the last try is the stroke. */
function commitStroke(s: MinigolfState): MinigolfState {
  if (s.finished) return s
  const last = s.tries.at(-1)
  const result = last?.result ?? null
  const balls = s.balls.map((b, seat): BallState => {
    if (seat === s.current) {
      const strokes = b.strokes + 1
      const at = result?.rest ?? b.at
      const status: BallStatus = result?.holed ? 'holed' : strokes >= s.cfg.maxStrokes ? 'done' : 'playing'
      return { at, strokes, status, paths: [...b.paths, result?.path ?? [b.at]] }
    }
    const moved = result?.others?.find(o => o.id === seat)
    if (!moved) return b
    return { ...b, at: moved.rest, status: moved.holed ? 'holed' : b.status }
  })
  const next = { ...s, balls, tries: [], visitStart: null }
  const k = next.order.indexOf(s.current)
  for (let i = 1; i <= next.order.length; i++) {
    const seat = next.order[(k + i) % next.order.length]
    if (inPlay(balls[seat])) return { ...next, current: seat }
  }
  return endHole(next)
}

function locked(s: MinigolfState): boolean {
  return s.finished || s.tries.length >= s.cfg.tries
}

/** The winner once the game is over: the lowest total (the lower seat on a tie). */
function winnerOf(s: MinigolfState): number | null {
  if (!s.finished) return null
  const t = totals(s)
  return t.indexOf(Math.min(...t))
}

export const minigolfModule: GameModule<MinigolfState, MinigolfConfig, MinigolfView, 'minigolf', MinigolfDetail> = {
  id: 'minigolf',
  version: 1,
  defaultConfig: { course: COURSES[0].id, tries: 3, maxStrokes: 6, ballContact: false, shotDelay: 3 },
  configMeta,
  positionalDarts: true,

  validate(cfg) {
    if (cfg.course !== 'mixed' && !getCourse(cfg.course)) return 'Unknown course'
    if (!(cfg.maxStrokes >= 3 && cfg.maxStrokes <= 10)) return 'Max strokes must be between 3 and 10'
    return null
  },

  init(cfg: MinigolfConfig, players: Player[], rng: Rng = Math.random): MinigolfState {
    const course = getCourse(cfg.course)
    const holes = course ? course.holes : mixedHoles(rng)
    const order = players.map((_, i) => i)
    return {
      cfg,
      courseName: course?.name ?? 'Mixed course',
      holes,
      physics: DEFAULT_PHYSICS,
      holeIdx: 0,
      order,
      current: 0,
      balls: freshBalls(holes[0], players.length),
      scores: holes.map(() => players.map(() => null)),
      visitStart: null,
      tries: [],
      lastHole: null,
      finished: false,
      playerCount: players.length,
    }
  },

  getCurrentPlayer: s => s.current,

  onBoardEvent(s: MinigolfState, e: BoardEvent) {
    switch (e.kind) {
      case 'visit.opened':
        return { state: { ...s, visitStart: s.balls.map(b => b.at), tries: [] } }
      case 'dart.detected':
        if (locked(s)) return { state: s }
        return { state: { ...s, tries: [...s.tries, playTry(s, e.data)] } }
      case 'takeout.finished':
      case 'visit.cleared':
        return { state: commitStroke(s) }
      default:
        return { state: s }
    }
  },

  onUserAction: s => ({ state: s }),

  view(s: MinigolfState): MinigolfView {
    return {
      winner: winnerOf(s),
      finished: s.finished,
      currentPlayer: s.current,
      visitLocked: locked(s),
      config: s.cfg,
      courseName: s.courseName,
      holeIdx: s.holeIdx,
      holeCount: s.holes.length,
      hole: holeView(s.holes[s.holeIdx]),
      pars: s.holes.map(h => h.par),
      holeNames: s.holes.map(h => h.name),
      order: s.order,
      balls: s.balls.map(b => ({ at: roundPt(b.at), strokes: b.strokes, status: b.status })),
      scores: s.scores,
      totals: totals(s),
      toPar: toPar(s),
      tries: s.tries.map(t => ({
        label: t.label,
        coords: t.coords,
        power: t.power,
        holed: t.result?.holed ?? false,
        missed: t.result === null,
        path: t.result ? roundPath(t.result.path) : [],
        others: (t.result?.others ?? []).map(o => ({ seat: o.id, path: roundPath(o.path), holed: o.holed })),
      })),
      lastHole: s.lastHole && { ...s.lastHole, paths: s.lastHole.paths.map(seat => seat.map(roundPath)) },
    }
  },

  summarize(s: MinigolfState): SeatResult[] {
    const strokes = totalsWithUnplayed(s)
    const placements = rankSeats(s.playerCount, null, (a, b) => strokes[a] - strokes[b])
    const par = s.holes.reduce((sum, h) => sum + h.par, 0)
    return placements.map((placement, seat) => {
      const played = s.scores.filter(row => row[seat] !== null)
      return {
        placement,
        stats: {
          strokes: strokes[seat],
          toPar: strokes[seat] - par,
          holesInOne: played.filter(row => row[seat] === 1).length,
          holesPlayed: played.length,
        },
      }
    })
  },

  detail(_visits, final): MinigolfDetail {
    return {
      mode: 'minigolf',
      course: final.courseName,
      holes: final.holes.map(h => ({ name: h.name, par: h.par })),
      scores: final.scores,
    }
  },

  matchStats(_visits, final) {
    const results = minigolfModule.summarize(final, { totalDarts: [], totalVisits: [] })
    return {
      rows: [
        row('strokes', 'Strokes', 'integer', 'lower', { compact: true }),
        row('toPar', 'To par', 'integer', 'lower', { compact: true }),
        row('holesInOne', 'Holes in one', 'integer', 'higher'),
        row('avgStrokes', 'Strokes per hole', 'decimal', 'lower'),
      ],
      seats: results
        .map((r, index) =>
          values({
            strokes: r.stats.strokes,
            toPar: r.stats.toPar,
            holesInOne: r.stats.holesInOne,
            avgStrokes: r.stats.holesPlayed > 0 ? playedStrokes(final, index) / r.stats.holesPlayed : undefined,
          }),
        )
        .map((v, index) => ({ index, values: v })),
    }
  },
}
