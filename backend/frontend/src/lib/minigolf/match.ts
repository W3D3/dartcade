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

/** "+3", "−2", "E" (even). */
export const fmtToPar = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : 'E')

const STATUS: Record<MinigolfGame['balls'][number]['status'], string> = {
  waiting: 'Waiting',
  playing: 'Putting',
  holed: 'In the cup',
  done: 'Done',
}

/** Everyone in this hole's turn order. */
export function rows(g: MinigolfGame, players: { name: string }[]): Row[] {
  return g.order.map(seat => {
    const b = g.balls[seat]
    const active = !g.finished && seat === g.currentPlayer
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
      'force' in s
        ? { area: s.area.map(pt), force: pt(s.force) }
        : { area: s.area.map(pt), radial: { ...s.radial, center: pt(s.radial.center) } },
    ),
    tee: pt(h.tee),
    cup: { at: pt(h.cup.at), r: h.cup.r },
  }
}

/** Where the putting player's ball is between shots: its spot, the tee before its first putt. */
export function ownBall(g: MinigolfGame): Pt {
  return pt(g.balls[g.currentPlayer]?.at ?? g.hole.tee)
}

/** The other balls on the felt: played and not in the cup. */
export function otherBalls(g: MinigolfGame, players: { name: string }[]): { seat: number; at: Pt; label: string }[] {
  return g.balls.flatMap((b, seat) =>
    seat !== g.currentPlayer && b.status === 'playing'
      ? [{ seat, at: pt(b.at), label: (players[seat]?.name ?? '?').slice(0, 1).toUpperCase() }]
      : [],
  )
}

/** The latest try's paths, to animate: the putted ball's, and the balls it knocked. */
export function latestShot(g: MinigolfGame): { key: string; own: Pt[]; others: { seat: number; path: Pt[] }[] } | null {
  const t = g.tries.at(-1)
  if (!t) return null
  return {
    // A new try, or a correction of the latest, changes the key
    key: `${g.holeIdx}:${g.currentPlayer}:${g.tries.length}:${t.label}:${t.coords?.x ?? ''}:${t.coords?.y ?? ''}`,
    own: t.path.length > 0 ? t.path.map(pt) : [ownBall(g)],
    others: t.others.map(o => ({ seat: o.seat, path: o.path.map(pt) })),
  }
}
