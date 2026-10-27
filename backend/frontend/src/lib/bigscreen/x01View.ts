// What the big screen shows for X01, computed from the snapshot alone (the kiosk has no saved game to read).
import { checkoutHint } from '$shared/checkout.js'
import { x01Slots, type Slot } from '../dartSlots.js'
import { plural, initial } from '../fmt.js'
import { x01Meta } from '../gameViews/meta.js'
import { avgOf, checkoutRate } from '../playerStats.js'
import { sharedBoard, winView } from '../winScreen.js'
import type { Snapshot } from '../ws.js'

type X01Snapshot = Extract<Snapshot, { gameId: 'x01' }>

function asX01(snap: Snapshot): X01Snapshot {
  if (snap.gameId !== 'x01') throw new Error(`not an X01 snapshot: ${snap.gameId}`)
  return snap
}

const sum = (xs: number[], seats: number[]) => seats.reduce((a, i) => a + (xs[i] ?? 0), 0)
/** From three seats on the big screen uses the party layout. */
const isParty = (sides: number) => sides > 2

/** A seat, or a team in a team game: one side of the match. */
function sides(snap: X01Snapshot) {
  const g = snap.game
  return g.teams
    ? g.teams.map(t => ({ name: t.name, seats: t.seats, score: t.score, legs: t.legs }))
    : snap.players.map((p, i) => ({ name: p.name, seats: [i], score: g.scores[i] ?? 0, legs: g.legs[i] ?? 0 }))
}

export type X01LiveSeat = {
  name: string
  initial: string
  score: number
  avg: string
  darts: number
  legs: number
  throwing: boolean
  next: boolean
}

export type X01LiveView = {
  header: { title: string; meta: string; leg: string; board: string | null }
  seats: X01LiveSeat[]
  firstTo: number
  /** The open visit: its darts, their total, and what the thrower is left with (null before a dart, or after a bust). */
  visit: { darts: string[]; total: number; leaves: number | null }
  /** The three dart slots of the visit, with the suggested finish. */
  slots: Slot[]
  checkout: { text: string; route: string } | null
  party: boolean
}

export function x01Live(input: Snapshot): X01LiveView {
  const snap = asX01(input)
  const g = snap.game
  const all = sides(snap)
  const darts = g.currentVisitDarts
  const total = darts.reduce((a, d) => a + d.score, 0)
  const cp = g.currentPlayer
  const score = g.scores[cp] ?? 0
  const opened = g.opened[cp] ?? true
  const meta = x01Meta(g, snap.players.length)

  const hint = !g.bustThisVisit && opened && score > 0 && darts.length < 3 ? checkoutHint(score, g.config.outMode, 3 - darts.length) : null
  return {
    header: { title: 'X01', meta, leg: meta.split(' · ').at(-1) ?? '', board: sharedBoard(snap) },
    seats: all.map(s => ({
      name: s.name,
      initial: initial(s.name),
      score: s.score,
      avg: avgOf(sum(g.pointsScored, s.seats), sum(g.dartsThrown, s.seats)),
      darts: sum(g.totalDarts, s.seats),
      legs: s.legs,
      throwing: s.seats.includes(cp),
      next: g.nextPlayer !== null && s.seats.includes(g.nextPlayer) && !s.seats.includes(cp),
    })),
    firstTo: g.firstTo,
    visit: {
      darts: darts.map(d => d.segment.name || 'Miss'),
      total,
      leaves: darts.length && !g.bustThisVisit ? (g.visitStartScores[cp] ?? score) - total : null,
    },
    slots: x01Slots({
      darts,
      remaining: score,
      outMode: g.config.outMode,
      opened,
      bust: g.bustThisVisit,
      suggest: true,
      finishFoot: 'to win',
    }),
    checkout: hint ? { text: `${score} left · ${plural(3 - darts.length, 'dart')}`, route: hint.join(' · ') } : null,
    party: isParty(all.length),
  }
}

export type X01WinStanding = { place: number; name: string; legs: number; avg: string; firstNine: string; darts: number }
export type X01WinStat = { label: string; values: string[]; /** The first side's share of the bar, 0..1. */ share: number }

export type X01WinView = {
  header: { title: string; meta: string; board: string | null }
  winner: X01WinStanding
  /** Legs per side, winner first. */
  legs: number[]
  firstTo: number
  /** The winner against the runner-up; empty with one side. */
  stats: X01WinStat[]
  /** The finishing darts ("T17 · D12") and the line above them; null when the snapshot no longer holds them. */
  gameShot: string | null
  gameShotText: string | null
  /** "2 legs to Lena's 1"; empty for a single-leg match. */
  note: string
  party: boolean
  standings: X01WinStanding[]
}

const DASH = '–'
const ratio = (a: number, b: number) => (a + b > 0 ? a / (a + b) : 0.5)

export function x01Win(input: Snapshot): X01WinView {
  const snap = asX01(input)
  const g = snap.game
  const all = sides(snap)
  // The win view ranks like the server does (winner, then legs, then points left); a game without a winner keeps seat order
  const ranked =
    winView(snap, null)?.competitors.map(c => ({ name: c.name, place: c.placement, seats: c.seats })) ??
    all.map((s, i) => ({ name: s.name, place: i + 1, seats: s.seats }))
  const standings: X01WinStanding[] = ranked.map(c => ({
    place: c.place,
    name: c.name,
    legs: all.find(s => s.seats === c.seats)?.legs ?? g.legs[c.seats[0]] ?? 0,
    avg: avgOf(sum(g.pointsScored, c.seats), sum(g.dartsThrown, c.seats)),
    firstNine: DASH,
    darts: sum(g.totalDarts, c.seats),
  }))
  const seatsOf = (i: number) => ranked[i].seats
  const rate = (i: number) => checkoutRate(sum(g.checkoutHits, seatsOf(i)), sum(g.checkoutAttempts, seatsOf(i))).checkout
  const hitRatio = (i: number) => {
    const attempts = sum(g.checkoutAttempts, seatsOf(i))
    return attempts ? sum(g.checkoutHits, seatsOf(i)) / attempts : 0
  }
  const points = (i: number) => sum(g.pointsScored, seatsOf(i)) / Math.max(1, sum(g.dartsThrown, seatsOf(i)))

  const stats: X01WinStat[] =
    ranked.length < 2
      ? []
      : [
          { label: '3-DART AVERAGE', values: [standings[0].avg, standings[1].avg], share: ratio(points(0), points(1)) },
          // The snapshot carries no first 9, highest finish, 180s or best leg: those rows stay empty
          { label: 'FIRST 9 AVERAGE', values: [DASH, DASH], share: 0.5 },
          { label: 'CHECKOUT', values: [rate(0), rate(1)], share: ratio(hitRatio(0), hitRatio(1)) },
          { label: 'HIGHEST FINISH', values: [DASH, DASH], share: 0.5 },
          { label: '180S', values: [DASH, DASH], share: 0.5 },
          { label: 'BEST LEG', values: [DASH, DASH], share: 0.5 },
        ]

  // The finishing visit is only in the snapshot until the takeout commits it
  const shot = g.winner === null ? [] : g.currentVisitDarts.map(d => d.segment.name || 'Miss')
  const finishedLeg = all.reduce((a, s) => a + s.legs, 0)
  const winnerSeats = seatsOf(0)
  const legDarts = g.legVisits.filter(v => winnerSeats.includes(v.seat)).reduce((a, v) => a + v.darts, 0)
  const second = standings.at(1)

  return {
    header: { title: 'X01', meta: x01Meta(g, snap.players.length).split(' · ').slice(0, -1).join(' · '), board: sharedBoard(snap) },
    winner: standings[0],
    legs: standings.map(s => s.legs),
    firstTo: g.firstTo,
    stats,
    gameShot: shot.length ? shot.join(' · ') : null,
    gameShotText: shot.length
      ? `${standings[0].name} · ${g.currentVisitDarts.reduce((a, d) => a + d.score, 0)} left · leg ${finishedLeg} in ${plural(legDarts, 'dart')}`
      : null,
    note: g.firstTo > 1 && second ? `${plural(standings[0].legs, 'leg')} to ${second.name}’s ${second.legs}` : '',
    party: isParty(ranked.length),
    standings,
  }
}
