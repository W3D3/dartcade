// What the big screen shows for Higher Lower, computed from the snapshot alone.
import { hiloSlots } from '../dartSlots.js'
import { highHint, hiloMeta } from '../hilo/view.js'
import { sharedBoard } from '../winScreen.js'
import type { Snapshot } from '../ws.js'
import { isParty } from './rowScale.js'
import { toTiles, type BoardProps, type SlotTile } from './tiles.js'

const EFFECT = { high: 'New high', low: 'New low', between: '−1 life', miss: '−1 life' } as const

export type HiloLiveSeat = {
  name: string
  lives: number
  total: number
  /** "2 of 3 lives". */
  livesText: string
  out: boolean
  throwing: boolean
  next: boolean
  /** The seat's previous visit and what it did, null before its first. */
  last: { total: number; effect: string; lost: boolean } | null
}

export type HiloLiveView = {
  header: { title: string; meta: string; board: string | null }
  seats: HiloLiveSeat[]
  high: number
  low: number
  /** The open visit's total on the scale; a visit that just lost a life keeps its marker. */
  marker: { total: number; lost: boolean } | null
  visit: { total: number }
  slots: SlotTile[]
  board: BoardProps
  party: boolean
  bullOff: boolean
}

export function hiloLive(snap: Snapshot): HiloLiveView {
  if (snap.gameId !== 'hilo') throw new Error(`not a Higher Lower snapshot: ${snap.gameId}`)
  const g = snap.game
  const bullOff = g.phase === 'bulloff'
  const cp = bullOff ? (g.bullOff?.currentPlayer ?? g.currentPlayer) : g.currentPlayer
  const darts = g.currentVisitDarts
  const hint = highHint(g, darts.length)
  const slots = hiloSlots({ darts, hint: hint && { need: hint.need, high: g.high }, locked: g.visitLocked })
  const r = g.lastResult
  const lostLast = r !== null && (r.outcome === 'between' || r.outcome === 'miss')
  return {
    header: { title: 'Higher Lower', meta: hiloMeta(g, snap.players.length), board: sharedBoard(snap) },
    seats: g.seats.map((s, i) => {
      const v = s.visits.at(-1)
      return {
        name: snap.players[i]?.name ?? '',
        lives: s.lives,
        total: g.cfg.lives,
        livesText: `${s.lives} of ${g.cfg.lives} ${g.cfg.lives === 1 ? 'life' : 'lives'}`,
        out: s.out,
        throwing: i === cp,
        next: !bullOff && g.nextPlayer === i && i !== cp,
        last: v ? { total: v.total, effect: EFFECT[v.outcome], lost: v.outcome === 'between' || v.outcome === 'miss' } : null,
      }
    }),
    high: g.high,
    low: g.low,
    marker: darts.length > 0 ? { total: g.visitTotal, lost: g.visitLocked } : lostLast ? { total: r.total, lost: true } : null,
    visit: { total: g.visitTotal },
    // The artboard names the bar the number beats
    slots: bullOff ? [] : toTiles(slots, s => (s.kind === 'suggested-next' ? `BEATS HIGH ${g.high}` : undefined)),
    board: { darts },
    party: isParty(g.seats.length),
    bullOff,
  }
}
