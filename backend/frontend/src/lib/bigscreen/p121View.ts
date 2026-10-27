// What the big screen shows for 121 Checkout, computed from the snapshot alone.
import { checkoutHint } from '$shared/checkout.js'
import { boardCheckoutTargets, x01Slots } from '../dartSlots.js'
import { plural } from '../fmt.js'
import { cap } from '../gameViews/meta.js'
import { tryNumber } from '../p121/view.js'
import type { Orientation } from './stage.js'
import { toTiles, type BoardProps, type SlotTile } from './tiles.js'
import { sharedBoard } from '../winScreen.js'
import type { Snapshot } from '../ws.js'

export type P121LiveSeat = {
  name: string
  tryLabel: string
  target: number
  left: number
  /** Tries made over tries played, "2/3". */
  made: string
  throwing: boolean
}

export type P121Try = { label: string; target: number; note: string; state: 'made' | 'missed' | 'current' }

export type P121LiveView = {
  header: { title: string; meta: string; board: string | null }
  seats: P121LiveSeat[]
  /** Index into `seats` of the thrower. */
  thrower: number
  /** The thrower's darts in this try: spent (committed and in the open visit), the try's total, "4 left". */
  dartsLeft: { used: number; total: number; text: string }
  /** The panel under the card: the route to finish, or, while the visit waits for takeout, BUST / MADE IT with no route. */
  checkout: { label: 'CHECKOUT' | 'BUST' | 'MADE IT'; text: string; route: string } | null
  visit: { total: number }
  slots: SlotTile[]
  board: BoardProps
  session: { score: string; tries: P121Try[] }
  /** Still throwing for the start: no checkout, visit or session. */
  bullOff: boolean
}

/** The artboard's session strip holds the last four tries. */
const SHOWN = 4
const MISS_NOTE = { reset: 'reset', down: 'down', stay: 'again' } as const

/**
 * Font size (px) of the checkout route so it fits beside the label: the box has ~550px of room in
 * landscape and ~900px in portrait, and Barlow Condensed runs ~0.42em a character.
 * One dart (or none) 110, two 84, three 64 in landscape; 110, 110, 96 in portrait.
 */
export function routeFontSize(route: string, orientation: Orientation): number {
  const n = route.split(' · ').filter(d => d && d !== '–').length
  const table = orientation === 'landscape' ? [110, 110, 84, 64] : [110, 110, 110, 96]
  return table[Math.min(n, 3)]
}

export function p121Live(snap: Snapshot): P121LiveView {
  if (snap.gameId !== 'p121') throw new Error(`not a 121 snapshot: ${snap.gameId}`)
  const g = snap.game
  const bullOff = g.phase === 'bulloff'
  const cp = bullOff ? (g.bullOff?.currentPlayer ?? g.currentPlayer) : g.currentPlayer
  const cur = g.seats[cp] ?? g.seats[0]
  const darts = g.currentVisitDarts
  const tryNo = tryNumber(cur.tries.length, g.cfg)

  const hint = !bullOff && !g.bust && cur.left > 0 && darts.length < 3 ? checkoutHint(cur.left, g.cfg.outMode, 3 - darts.length) : null
  const used = Math.min(cur.darts + darts.length, g.cfg.dartsPerTry)
  const tries: P121Try[] = cur.tries.map((t, i) => ({
    label: `TRY ${i + 1}`,
    target: t.target,
    note: t.made ? `made · ${plural(t.darts, 'dart')}` : `missed · ${MISS_NOTE[g.cfg.missRule]}`,
    state: t.made ? 'made' : 'missed',
  }))
  if (!cur.done) tries.push({ label: `TRY ${tryNo}`, target: cur.target, note: 'in progress', state: 'current' })

  const slots = bullOff
    ? []
    : x01Slots({
        darts,
        remaining: cur.left,
        outMode: g.cfg.outMode,
        opened: true,
        bust: g.bust,
        suggest: true,
        finishFoot: 'checks out',
      })

  return {
    header: {
      title: '121 Checkout',
      meta: `${snap.players.length === 1 ? 'Practice · ' : ''}${g.cfg.dartsPerTry} darts per try · ${cap(g.cfg.outMode)} out · Try ${tryNo} of ${g.cfg.tries}`,
      board: sharedBoard(snap),
    },
    seats: g.seats.map((s, i) => ({
      name: snap.players[i]?.name ?? '',
      tryLabel: `TRY ${tryNumber(s.tries.length, g.cfg)} OF ${g.cfg.tries}`,
      target: s.target,
      left: s.left,
      made: `${s.made}/${s.tries.length}`,
      throwing: i === cp,
    })),
    thrower: g.seats.indexOf(cur),
    dartsLeft: { used, total: g.cfg.dartsPerTry, text: `${g.cfg.dartsPerTry - used} left` },
    checkout: bullOff
      ? null
      : g.bust
        ? { label: 'BUST', text: 'No score · take your darts out', route: '' }
        : cur.left === 0
          ? { label: 'MADE IT', text: `Take your darts out · up to ${cur.target + 1}`, route: '' }
          : hint
            ? { label: 'CHECKOUT', text: `Make it to move up to ${cur.target + 1}`, route: hint.join(' · ') }
            : { label: 'CHECKOUT', text: `Score ${cur.left} to make it`, route: '–' },
    visit: { total: g.visitStartLeft - cur.left },
    slots: toTiles(slots),
    board: { darts, checkoutTargets: boardCheckoutTargets(slots, true) },
    session: { score: `${cur.made}/${cur.tries.length}`, tries: tries.slice(-SHOWN) },
    bullOff,
  }
}
