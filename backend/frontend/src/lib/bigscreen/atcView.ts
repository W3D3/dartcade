// What the big screen shows for Around the Clock, computed from the snapshot alone.
import { atcSlots } from '../dartSlots.js'
import { atcTargetSegment } from '../atc.js'
import { atcMeta } from '../gameViews/meta.js'
import { atcPlayer } from '../playerStats.js'
import type { AtcCell } from '../atc.js'
import { sharedBoard } from '../winScreen.js'
import type { Snapshot } from '../ws.js'
import { isParty } from './rowScale.js'
import { toTiles, type BoardProps, type SlotTile } from './tiles.js'

export type AtcLiveSeat = {
  name: string
  target: string
  hitRate: string
  darts: number
  /** "13 of 21 done". */
  doneText: string
  cells: AtcCell[]
  throwing: boolean
  next: boolean
}

export type AtcLiveView = {
  header: { title: string; meta: string; board: string | null }
  seats: AtcLiveSeat[]
  /** From three seats the seats are rows. */
  party: boolean
  /** Targets gained in the open visit, "+1". */
  visit: { total: string }
  slots: SlotTile[]
  /** The board lights the thrower's wedge and outlines the next seat's. */
  board: BoardProps
}

export function atcLive(snap: Snapshot): AtcLiveView {
  if (snap.gameId !== 'atc') throw new Error(`not an Around the Clock snapshot: ${snap.gameId}`)
  const g = snap.game
  const n = snap.players.length
  const cp = g.currentPlayer
  const seats = snap.players.map((p, i) => {
    const v = atcPlayer(g, i)
    return {
      name: p.name,
      target: v.target,
      hitRate: v.hitRate,
      darts: v.darts,
      doneText: `${v.done} of ${v.total} done`,
      cells: v.cells,
      throwing: i === cp,
      // Seat order: the snapshot has no nextPlayer, so throwAgainOnAllHit (same seat again) can make this wrong
      next: n > 1 && i === (cp + 1) % n,
    }
  })
  const nextSeat = seats.findIndex(s => s.next)
  const aim = seats[cp]?.target
  // shortcut: no walk (the visit's start isn't in the snapshot), so a multiplier that advances shows its multiplier even where the sequence ends sooner; send the start index if that matters
  const slots = atcSlots({
    darts: g.currentVisitDarts,
    hits: g.currentVisitHits,
    target: aim && aim !== '✓' ? aim : null,
    multiplierAdvances: g.cfg.multiplierAdvances,
  })
  const gained = slots.reduce((a, s) => a + (s.kind === 'thrown' ? Number(s.points.replace('+', '')) : 0), 0)
  return {
    header: { title: 'Around the Clock', meta: atcMeta(g, n), board: sharedBoard(snap) },
    seats,
    party: isParty(n),
    visit: { total: `+${gained}` },
    slots: toTiles(slots, s => (s.kind === 'thrown' ? `${s.points} · ON TARGET` : s.kind === 'miss' ? 'MISS' : undefined)),
    board: {
      darts: g.currentVisitDarts,
      target: atcTargetSegment(g.sequence, g.targets[cp]),
      nextTarget: nextSeat >= 0 ? atcTargetSegment(g.sequence, g.targets[nextSeat]) : null,
    },
  }
}
