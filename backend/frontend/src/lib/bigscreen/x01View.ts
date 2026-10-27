// What the big screen shows for X01, computed from the snapshot alone (the kiosk has no saved game to read).
import { checkoutHint } from '$shared/checkout.js'
import { boardCheckoutTargets, x01Slots } from '../dartSlots.js'
import { plural } from '../fmt.js'
import { x01MetaParts } from '../gameViews/meta.js'
import { avgOf } from '../playerStats.js'
import { sharedBoard, x01Win as winViewOf } from '../winScreen.js'
import type { GameDetail } from '../api'
import type { Snapshot } from '../ws.js'
import { isParty } from './rowScale.js'
import { toTiles, type BoardProps, type SlotTile } from './tiles.js'

type X01Snapshot = Extract<Snapshot, { gameId: 'x01' }>

function asX01(snap: Snapshot): X01Snapshot {
  if (snap.gameId !== 'x01') throw new Error(`not an X01 snapshot: ${snap.gameId}`)
  return snap
}

const sum = (xs: number[], seats: number[]) => seats.reduce((a, i) => a + (xs[i] ?? 0), 0)

/** A seat, or a team in a team game: one side of the match. */
function sides(snap: X01Snapshot) {
  const g = snap.game
  return g.teams
    ? g.teams.map(t => ({ name: t.name, seats: t.seats, score: t.score, legs: t.legs }))
    : snap.players.map((p, i) => ({ name: p.name, seats: [i], score: g.scores[i] ?? 0, legs: g.legs[i] ?? 0 }))
}

export type X01LiveSeat = {
  name: string
  score: number
  avg: string
  darts: number
  legs: number
  throwing: boolean
  next: boolean
}

export type X01LiveView = {
  /** `meta` is the whole line, `leg` its last part (the portrait header). */
  header: { title: string; meta: string; leg: string; board: string | null }
  seats: X01LiveSeat[]
  firstTo: number
  visit: { total: number }
  /** The three dart slots of the visit, with the suggested finish. */
  slots: SlotTile[]
  board: BoardProps
  checkout: { text: string; route: string } | null
  party: boolean
  /** Still throwing for the start: no visit, checkout or slots. */
  bullOff: boolean
}

export function x01Live(input: Snapshot): X01LiveView {
  const snap = asX01(input)
  const g = snap.game
  const all = sides(snap)
  const darts = g.currentVisitDarts
  const total = darts.reduce((a, d) => a + d.score, 0)
  const bullOff = g.phase === 'bulloff'
  // In the bull off the thrower is the bull off's, and there is no visit to finish
  const cp = bullOff ? (g.bullOff?.currentPlayer ?? g.currentPlayer) : g.currentPlayer
  const score = g.scores[cp] ?? 0
  const opened = g.opened[cp] ?? true
  const meta = x01MetaParts(g, snap.players.length)

  const hint =
    !bullOff && !g.bustThisVisit && opened && score > 0 && darts.length < 3 ? checkoutHint(score, g.config.outMode, 3 - darts.length) : null
  const slots = bullOff
    ? []
    : x01Slots({
        darts,
        remaining: score,
        outMode: g.config.outMode,
        opened,
        bust: g.bustThisVisit,
        suggest: true,
        finishFoot: 'to win',
      })
  return {
    header: { title: 'X01', meta: `${meta.rules} · ${meta.leg}`, leg: meta.leg, board: sharedBoard(snap) },
    seats: all.map(s => ({
      name: s.name,
      score: s.score,
      avg: avgOf(sum(g.pointsScored, s.seats), sum(g.dartsThrown, s.seats)),
      darts: sum(g.totalDarts, s.seats),
      legs: s.legs,
      throwing: s.seats.includes(cp),
      next: !bullOff && g.nextPlayer !== null && s.seats.includes(g.nextPlayer) && !s.seats.includes(cp),
    })),
    firstTo: g.firstTo,
    visit: { total },
    bullOff,
    slots: toTiles(slots),
    board: { darts, checkoutTargets: boardCheckoutTargets(slots, true) },
    checkout: hint ? { text: `${score} left · ${plural(3 - darts.length, 'dart')}`, route: hint.join(' · ') } : null,
    party: isParty(all.length),
  }
}

export type X01WinStanding = { place: number; name: string; legs: number; avg: string; firstNine: string; darts: number }
export type X01WinStat = { label: string; values: string[]; /** The first side's share of the bar, 0..1. */ share: number }

export type X01WinView = {
  /** `meta` is the rules; `format` the match format, their last part (the portrait header). */
  header: { title: string; meta: string; format: string; board: string | null }
  winner: X01WinStanding
  /** Legs per side, winner first. */
  legs: number[]
  firstTo: number
  /** The winner against the runner-up; empty with one side. */
  stats: X01WinStat[]
  /** The finishing darts ("T17 · D12"); null until the saved game arrives. */
  gameShot: string | null
  /** "Christoph · 75 left · leg 4 in 17 darts"; null when the last visit isn't the winner's. */
  gameShotText: string | null
  /** "GAME SHOT · LEG 3". */
  kicker: string
  /** "2 legs to Lena's 1"; empty for a single-leg match. */
  note: string
  party: boolean
  standings: X01WinStanding[]
}

const DASH = '–'
// The artboard shows "50%" and "15" where the details page says "50% · 3/6" and "15 darts"
const bare = (v: string) => v.split(' · ')[0].replace(/ darts?$/, '')
const NO_STATS = ['3-DART AVERAGE', 'FIRST 9 AVERAGE', 'CHECKOUT', 'HIGHEST FINISH', '180S', 'BEST LEG']

export function x01Win(input: Snapshot, detail: GameDetail | null = null): X01WinView {
  const snap = asX01(input)
  const g = snap.game
  const w = winViewOf(snap, detail)
  const all = sides(snap)
  const standings: X01WinStanding[] = w.competitors.map(c => ({
    place: c.placement,
    name: c.name,
    legs: c.score,
    // The snapshot always has the average; the first 9 only comes with the saved game
    avg: avgOf(sum(g.pointsScored, c.seats), sum(g.dartsThrown, c.seats)),
    firstNine: detail ? c.cells[2] : DASH,
    darts: sum(g.totalDarts, c.seats),
  }))
  const [first, second] = standings

  // The saved game's rows (3-dart average ... best leg) once it is here; dashes until then
  const stats: X01WinStat[] =
    standings.length < 2
      ? []
      : detail
        ? w.stats.map(r => ({ label: r.label.toUpperCase(), values: r.values.map(bare), share: r.share }))
        : NO_STATS.map((label, i) => ({ label, values: i === 0 ? [first.avg, second.avg] : [DASH, DASH], share: 0.5 }))

  // The finishing visit is the leg's last one (the open visit is empty once the game is won)
  const last = g.legVisits.at(-1)
  const winnerSeats = w.competitors[0].seats
  const finishedLeg = all.reduce((a, s) => a + s.legs, 0)
  const legDarts = g.legVisits.filter(v => winnerSeats.includes(v.seat)).reduce((a, v) => a + v.darts, 0)
  const shot = last && g.winner !== null && winnerSeats.includes(last.seat) && last.left === 0 ? last : undefined

  const { rules, format } = x01MetaParts(g, snap.players.length)
  return {
    header: { title: 'X01', meta: rules, format, board: sharedBoard(snap) },
    winner: first,
    legs: standings.map(s => s.legs),
    firstTo: g.firstTo,
    stats,
    gameShot: shot ? (w.checkout?.darts ?? null) : null,
    gameShotText: shot ? `${first.name} · ${shot.scored} left · leg ${finishedLeg} in ${plural(legDarts, 'dart')}` : null,
    kicker: w.kicker.toUpperCase(),
    note: g.firstTo > 1 && standings.length > 1 ? `${plural(first.legs, 'leg')} to ${second.name}’s ${second.legs}` : '',
    party: isParty(standings.length),
    standings,
  }
}
