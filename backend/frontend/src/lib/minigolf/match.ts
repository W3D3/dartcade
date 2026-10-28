// The minigolf match screen's model: player rows, the try slots, which balls are on the felt,
// and which try to animate. Pure, from the snapshot's game.
import type { MinigolfGame, MinigolfHole } from '$lib/api'
import { CUP_DEPTH, heightAt } from '$shared/minigolf/3d/ground'
import { BALL_R, type Hole, type PathPt, type Pt } from '$shared/minigolf/types'

export type Row = {
  seat: number
  name: string
  /** Strokes on this hole. */
  strokes: number
  total: number
  toPar: string
  status: string
  active: boolean
}

export type Slot = { label: string; note: string; state: 'kept' | 'replaced' | 'empty' }

/** "+3", "−2", "±0" (par exactly; golf writes "E", which few people read as "even"). */
export const fmtToPar = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

const STATUS: Record<MinigolfGame['balls'][number]['status'], string> = {
  waiting: 'Waiting',
  playing: 'Putting',
  holed: 'In the cup',
  done: 'Done',
}

/** Everyone in this hole's turn order; `up` is who's shown putting (the one whose stroke still rolls). */
export function rows(g: MinigolfGame, players: { name: string }[], up = g.currentPlayer): Row[] {
  return g.order.map(seat => {
    const b = g.balls[seat]
    const active = !g.finished && seat === up
    return {
      seat,
      name: players[seat]?.name ?? `Player ${seat + 1}`,
      strokes: b.strokes,
      total: g.totals[seat],
      toPar: fmtToPar(g.toPar[seat]),
      status: active ? 'Putting' : b.status === 'playing' ? 'On the green' : STATUS[b.status],
      active,
    }
  })
}

/** The open visit's darts as slots: every try with what it did; the last one is kept at takeout. */
export function trySlots(g: MinigolfGame): Slot[] {
  const n = g.config.tries
  return Array.from({ length: n }, (_, i): Slot => {
    const t = g.tries.at(i)
    if (!t) return { label: '', note: n === 1 ? 'Throw' : i === 0 ? 'Throw' : 'Retry optional', state: 'empty' }
    const knocked = t.others.filter(o => o.holed).length
    const note = t.missed
      ? 'Missed the board'
      : t.holed
        ? 'In the cup'
        : `${Math.round((t.power ?? 0) * 100)}%${knocked > 0 ? ' · knocked one in' : ''}`
    return { label: t.label, note, state: i === g.tries.length - 1 ? 'kept' : 'replaced' }
  })
}

const pt = (p: number[]): Pt => [p[0] ?? 0, p[1] ?? 0]

/** The snapshot's hole (points as plain arrays) as the core's Hole, for HoleView. */
export function toHole(h: MinigolfHole): Hole {
  return {
    ...h,
    outline: h.outline.map(pt),
    walls: h.walls.map(w => ({ ...w, points: w.points.map(pt) })),
    bumpers: h.bumpers.map(b => ({ ...b, at: pt(b.at) })),
    slopes: h.slopes.map(s =>
      'radial' in s
        ? { radial: { ...s.radial, center: pt(s.radial.center) } }
        : { bump: { ...s.bump, from: pt(s.bump.from), to: pt(s.bump.to) } },
    ),
    terrain: h.terrain?.map(t => ({ mesa: { ...t.mesa, from: pt(t.mesa.from), to: pt(t.mesa.to) } })),
    tee: pt(h.tee),
    cup: { at: pt(h.cup.at), r: h.cup.r },
  }
}

/** Where the putting player's ball is between shots: its spot, the tee before its first putt. */
export function ownBall(g: MinigolfGame): Pt {
  return pt(g.balls[g.currentPlayer]?.at ?? g.hole.tee)
}

/** A seat's ball at rest; one that's holed lies on the cup's floor (3D draws it down there). */
export function restingAt(g: MinigolfGame, seat: number, hole: Hole = toHole(g.hole)): PathPt {
  const b = g.balls[seat]
  const p = pt(b.at)
  return b.status === 'holed' ? [...p, heightAt(hole, hole.cup.at) - CUP_DEPTH + BALL_R] : p
}

/** The other balls played on this hole, on the felt or in the cup (`up`: the ball drawn as the putter's). */
export function otherBalls(
  g: MinigolfGame,
  players: { name: string }[],
  up = g.currentPlayer,
): { seat: number; at: PathPt; label: string }[] {
  const hole = toHole(g.hole)
  return g.balls.flatMap((b, seat) =>
    seat !== up && (b.status === 'playing' || b.status === 'holed')
      ? [{ seat, at: restingAt(g, seat, hole), label: (players[seat]?.name ?? '?').slice(0, 1).toUpperCase() }]
      : [],
  )
}

/** A shot to roll: on which hole, whose ball, its path, the balls it knocked. */
export type Roll = {
  key: string
  hole: number
  seat: number
  /** The paths keep the 3D physics' heights. */
  own: PathPt[]
  others: { seat: number; path: PathPt[] }[]
  /** When the ball knocks into something, in path samples; and whether it drops (for its sounds). */
  hits: number[]
  holed: boolean
}

/**
 * What to roll: the stroke just kept (Shoot, or pulling the darts), on its hole. Tries never roll,
 * not even once the last dart shows them: the stroke rolls when it's kept. null for nothing.
 */
export function rollFor(g: MinigolfGame): Roll | null {
  const k = g.lastStroke
  // This hole's, or the one that just ended (it rolls on that hole before the scorecard)
  const onHole = k?.hole === g.holeIdx || (k?.hole === g.lastHole?.index && k?.hole === g.holeIdx - 1)
  if (g.tries.length > 0 || !k || !onHole || k.path.length < 2) return null
  return {
    key: `stroke:${k.hole}:${k.seat}:${k.stroke}`,
    hole: k.hole,
    seat: k.seat,
    own: k.path,
    others: k.others.map(o => ({ seat: o.seat, path: o.path })),
    hits: k.hits,
    holed: k.holed,
  }
}

/** The last stroke's roll while it still has to play before the win screen (`rolled`: the key that already did); null once it has, or with none. */
export function pendingRoll(g: MinigolfGame | null, rolled: string | null): string | null {
  const key = g?.finished ? (rollFor(g)?.key ?? null) : null
  return key !== null && key !== rolled ? key : null
}

/** The cup a roll slows down near: its own hole's, which isn't the shown one once the stroke ended it. */
export function rollCup(g: MinigolfGame, roll: Roll): number[] {
  return roll.hole === g.holeIdx || !g.lastHole ? g.hole.cup.at : g.lastHole.hole.cup.at
}

/** Whether a roll played its hole out (the last ball in, or the game over): the camera then circles
 *  that hole's cup for ORBIT_MS before the scorecard or the win screen. */
export function endsHole(g: MinigolfGame, roll: Roll): boolean {
  return roll.hole !== g.holeIdx || g.finished
}

/** How long the camera circles a played-out hole. */
export const ORBIT_MS = 4500

/** A pause before a stroke rolls, for the suspense (and to look up from the board). */
export const ROLL_DELAY_MS = 3000

/** The shot preview's aim lines until the stroke is kept, from the putter's ball (`ownBall`): the
 *  latest try's bright, the ones it replaced faint. Not simulated: a straight line in the putt's
 *  direction, as long as it would roll on flat felt. */
export function aimLines(g: MinigolfGame, ball: Pt): { from: Pt; dir: Pt; roll: number; current: boolean }[] {
  const last = g.tries.length - 1
  return g.tries.flatMap((t, i) => (t.aim ? [{ from: ball, dir: pt(t.aim.dir), roll: t.aim.roll, current: i === last }] : []))
}

/** Playback speed at a frame of a roll: a bit slower than real time to follow it, and slow motion
 *  near the cup, where it gets exciting. */
export function rollRate(at: PathPt, cup: number[]): number {
  const d = Math.hypot(at[0] - (cup[0] ?? 0), at[1] - (cup[1] ?? 0))
  // Eases from PLAYBACK at SLOW_MO_RANGE down to SLOW_MO at half of it, so it never lurches
  const t = Math.min(1, Math.max(0, (SLOW_MO_RANGE - d) / (SLOW_MO_RANGE / 2)))
  return PLAYBACK + (SLOW_MO - PLAYBACK) * t * t * (3 - 2 * t)
}
/** Real balls roll too fast to follow on a zoomed-in screen. */
export const PLAYBACK = 0.6
/** Within this far of the cup (mm) a roll slows down, reaching SLOW_MO at half the distance. */
export const SLOW_MO_RANGE = 300
export const SLOW_MO = 0.25

/** Whether the shot panel (board, tries, controls) starts open: as last left on this device, else
 *  open for darts entered by hand and shut when a board scores (Shoot stays in reach either way). */
export function shotPanelOpen(saved: string | null, manual: boolean): boolean {
  return saved === 'open' || saved === 'closed' ? saved === 'open' : manual
}
