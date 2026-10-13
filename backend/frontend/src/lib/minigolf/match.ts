// The minigolf match screen's model: player rows, the try slots, which balls are on the felt,
// and which try to animate. Pure, from the snapshot's game.
import type { MinigolfGame, MinigolfHole } from '$lib/api'
import type { Hole, Pt } from '$shared/minigolf/types'

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
    tee: pt(h.tee),
    cup: { at: pt(h.cup.at), r: h.cup.r },
  }
}

/** Where the putting player's ball is between shots: its spot, the tee before its first putt. */
export function ownBall(g: MinigolfGame): Pt {
  return pt(g.balls[g.currentPlayer]?.at ?? g.hole.tee)
}

/** The other balls on the felt: played and not in the cup (`up`: the ball drawn as the putter's). */
export function otherBalls(g: MinigolfGame, players: { name: string }[], up = g.currentPlayer): { seat: number; at: Pt; label: string }[] {
  return g.balls.flatMap((b, seat) =>
    seat !== up && b.status === 'playing' ? [{ seat, at: pt(b.at), label: (players[seat]?.name ?? '?').slice(0, 1).toUpperCase() }] : [],
  )
}

/** A shot to roll: on which hole, whose ball, its path, the balls it knocked. */
export type Roll = {
  key: string
  hole: number
  seat: number
  own: Pt[]
  others: { seat: number; path: Pt[] }[]
  kept: boolean
  /** The stroke it is (hole:seat:stroke number): a kept stroke whose last try already rolled isn't rolled again. */
  stroke: string
  /** When the ball knocks into something, in path samples; and whether it drops (for its sounds). */
  hits: number[]
  holed: boolean
}

/**
 * What to roll: the latest try once it's revealed (the tries are used up), else the stroke just
 * kept when its tries were hidden. null for nothing new.
 */
export function rollFor(g: MinigolfGame): Roll | null {
  const t = g.tries.at(-1)
  if (t && !g.shotHidden && t.path.length > 0) {
    return {
      // A new try, or a correction of the latest, changes the key
      key: `try:${g.holeIdx}:${g.currentPlayer}:${g.tries.length}:${t.label}:${t.coords?.x ?? ''}:${t.coords?.y ?? ''}`,
      hole: g.holeIdx,
      seat: g.currentPlayer,
      own: t.path.map(pt),
      others: t.others.map(o => ({ seat: o.seat, path: o.path.map(pt) })),
      kept: false,
      stroke: `${g.holeIdx}:${g.currentPlayer}:${(g.balls[g.currentPlayer]?.strokes ?? 0) + 1}`,
      hits: t.hits,
      holed: t.holed,
    }
  }
  const k = g.lastStroke
  // This hole's, or the one that just ended (it rolls on that hole before the scorecard)
  const onHole = k?.hole === g.holeIdx || (k?.hole === g.lastHole?.index && k?.hole === g.holeIdx - 1)
  if (g.tries.length > 0 || !k || !onHole || k.path.length < 2) return null
  return {
    key: `stroke:${k.hole}:${k.seat}:${k.stroke}`,
    hole: k.hole,
    seat: k.seat,
    own: k.path.map(pt),
    others: k.others.map(o => ({ seat: o.seat, path: o.path.map(pt) })),
    kept: true,
    stroke: `${k.hole}:${k.seat}:${k.stroke}`,
    hits: k.hits,
    holed: k.holed,
  }
}

/**
 * What the match screen does with what rollFor gives it: animate it or not, and the stroke it then
 * remembers as rolled. Not the roll already there when the page opened (it shows the game at rest),
 * and not a kept stroke whose last try already rolled. No roll means the tries went back to hidden
 * (an undo): a stroke kept after that has never rolled, so it's forgotten.
 */
export function nextRoll(roll: Roll | null, openedOn: string | null, rolledStroke: string): { animate: boolean; rolledStroke: string } {
  if (!roll) return { animate: false, rolledStroke: '' }
  if (roll.key === openedOn || (roll.kept && roll.stroke === rolledStroke)) return { animate: false, rolledStroke }
  return { animate: true, rolledStroke: roll.stroke }
}

/** A pause before a stroke rolls, for the suspense (and to look up from the board). */
export const ROLL_DELAY_MS = 3000

/** The shot preview's lines while darts are left: the latest try's bright, the ones it replaced faint. */
export function previewLines(g: MinigolfGame): { path: Pt[]; current: boolean }[] {
  if (!g.shotHidden) return []
  const last = g.tries.length - 1
  return g.tries.flatMap((t, i) => (t.preview.length > 1 ? [{ path: t.preview.map(pt), current: i === last }] : []))
}

/** Playback speed at a frame of a roll: a bit slower than real time to follow it, and slow motion
 *  near the cup, where it gets exciting. */
export function rollRate(at: Pt, cup: number[]): number {
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
