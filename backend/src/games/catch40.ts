// Catch 40 (John Part's routine): check out 61, 62, ... 100 in order, one attempt of 6 darts per
// target, double out. A quicker checkout scores more (see `pointsFor`). Every seat plays each target
// in turn before the ladder moves on.
import type { GameModule, Player, BoardEvent, CommittedVisit, Dart, MatchStats, Catch40Detail, SeatResult, UserAction } from '../session/types.js'
import type { Catch40View } from '../session/views.js'
import { withBullOff } from '../session/withBullOff.js'
import { scoreDart } from './outRules.js'
import { rankSeats } from './ranking.js'
import { row, values } from './matchStats.js'
import { nextTurn, upNext } from './turns.js'
import { DARTS_PER_VISIT } from '../shared/darts.js'
import { dartLabel } from './p121.js'

export const FIRST_TARGET = 61
export const LAST_TARGET = 100
export const TARGETS = LAST_TARGET - FIRST_TARGET + 1
export const DARTS_PER_TARGET = 6
/** The target a 3-dart checkout scores full points on: 2 darts can't finish it. */
const HARD_TARGET = 99

export type Catch40Config = { bullOff: 'off' | 'wdc' | 'pdc' }

export type Catch40Try = { target: number; darts: number; points: number; finish: string | null }

export type Catch40Seat = {
  /** Finished targets, in order; the open target is `FIRST_TARGET + tries.length`. */
  tries: Catch40Try[]
  /** Points left on the open target. */
  left: number
  /** Darts used by the open target's committed visits. */
  darts: number
}

export type Catch40Result = { seat: number; target: number; darts: number; points: number }

export type Catch40State = {
  cfg: Catch40Config
  seats: Catch40Seat[]
  order: number[]
  turn: number
  currentPlayer: number
  visitStartLeft: number
  visitDarts: number
  bust: boolean
  phase: 'game' | 'finished'
  winner: number | null
  lastResult: Catch40Result | null
  /** The label of the dart that just checked out the open target; reset on visit.opened. */
  finishLabel: string | null
}

/** Points for checking `target` out in `darts` (null: not checked out within the darts). */
export function pointsFor(target: number, darts: number | null): number {
  if (darts === null) return 0
  if (darts <= 2) return 3
  if (darts === 3) return target === HARD_TARGET ? 3 : 2
  return 1
}

export const targetOf = (seat: Catch40Seat) => FIRST_TARGET + seat.tries.length
export const totalOf = (seat: Catch40Seat) => seat.tries.reduce((sum, t) => sum + t.points, 0)

const withSeat = (s: Catch40State, i: number, patch: Partial<Catch40Seat>): Catch40Seat[] =>
  s.seats.map((seat, j) => (j === i ? { ...seat, ...patch } : seat))

// Pushes the finished target and moves the seat on to the next one.
function finishTarget(s: Catch40State, checkedOut: boolean, used: number): Catch40State {
  const cp = s.currentPlayer
  const seat = s.seats[cp]
  const target = targetOf(seat)
  const points = pointsFor(target, checkedOut ? used : null)
  const done: Catch40Try = { target, darts: used, points, finish: checkedOut ? s.finishLabel : null }
  const seats = withSeat(s, cp, { tries: [...seat.tries, done], left: target + 1, darts: 0 })
  return { ...s, seats, lastResult: { seat: cp, target, darts: used, points } }
}

// Commits the open visit: the target ends on a checkout or once its darts run out (a bust uses
// the whole visit, as in X01), otherwise the attempt goes on with the next visit.
function endVisit(s: Catch40State, checkedOut: boolean): Catch40State {
  const cp = s.currentPlayer
  const seat = s.seats[cp]
  const used = checkedOut ? seat.darts + s.visitDarts : seat.darts + DARTS_PER_VISIT
  if (!(checkedOut || used >= DARTS_PER_TARGET)) return { ...s, seats: withSeat(s, cp, { darts: used }) }
  return finishTarget(s, checkedOut, used)
}

// Ends the visit. A seat plays its whole target (up to 6 darts) before the next seat throws, so
// every seat is always on the same target; a visit that leaves the target open just starts the next one.
function afterVisit(s: Catch40State, checkedOut: boolean): Catch40State {
  const cp = s.currentPlayer
  const ended = endVisit(s, checkedOut)
  if (ended.seats[cp].tries.length > s.seats[cp].tries.length) return advance(ended)
  return { ...ended, visitStartLeft: ended.seats[cp].left, visitDarts: 0, bust: false }
}

const isDone = (seat: Catch40Seat) => seat.tries.length >= TARGETS

/** Highest total first; ties compare 0. */
export const compareSeats = (a: Catch40Seat, b: Catch40Seat) => totalOf(b) - totalOf(a)

function rankWinner(s: Catch40State): number {
  let winner = 0
  for (let i = 1; i < s.seats.length; i++) if (compareSeats(s.seats[i], s.seats[winner]) < 0) winner = i
  return winner
}

// The next seat in order whose seat has targets left; the game ends when none has.
function advance(s: Catch40State): Catch40State {
  const next = nextTurn(s.order, s.turn, seat => !isDone(s.seats[seat]))
  if (!next) return { ...s, phase: 'finished', winner: rankWinner(s) }
  return { ...s, turn: next.turn, currentPlayer: next.seat, visitStartLeft: s.seats[next.seat].left, visitDarts: 0, bust: false }
}

// The open visit is decided (a checkout or a bust) and only waits for takeout.
const locked = (s: Catch40State) => s.bust || s.seats[s.currentPlayer].left === 0

const MATCH_STATS_ROWS = [
  row('total', 'Total', 'integer', 'higher', { compact: true }),
  row('checkouts', 'Checkouts', 'ratio', 'higher', { of: 'targets' }),
  row('avgDarts', 'Average darts', 'decimal', 'lower'),
]

const made = (seat: Catch40Seat) => seat.tries.filter(t => t.finish !== null)
const avgDarts = (seat: Catch40Seat) => {
  const m = made(seat)
  return m.length ? m.reduce((sum, t) => sum + t.darts, 0) / m.length : undefined
}

/** Catch 40 without a bull off; withBullOff is added where this is registered. */
export const catch40Game: GameModule<Catch40State, Catch40Config, Catch40View, 'catch40', Catch40Detail> = {
  id: 'catch40',
  version: 1,
  scoreBased: true,
  defaultConfig: { bullOff: 'off' },
  configMeta: {},

  validate: () => null,

  init(cfg: Catch40Config, players: Player[]): Catch40State {
    const n = players.length
    return {
      cfg,
      seats: Array.from({ length: n }, () => ({ tries: [], left: FIRST_TARGET, darts: 0 })),
      order: Array.from({ length: n }, (_, i) => i),
      turn: 0,
      currentPlayer: 0,
      visitStartLeft: FIRST_TARGET,
      visitDarts: 0,
      bust: false,
      phase: 'game',
      winner: null,
      lastResult: null,
      finishLabel: null,
    }
  },

  getCurrentPlayer: s => s.currentPlayer,

  onBoardEvent(s: Catch40State, e: BoardEvent): { state: Catch40State } {
    switch (e.kind) {
      case 'visit.opened':
        return { state: { ...s, visitStartLeft: s.seats[s.currentPlayer].left, visitDarts: 0, bust: false, finishLabel: null } }

      case 'dart.detected': {
        const cp = s.currentPlayer
        const seat = s.seats[cp]
        // A checkout mid-visit ends the visit; leftover darts in it aren't needed and don't count.
        if (seat.left === 0) return { state: s }
        if (s.phase === 'finished' || s.bust) return { state: { ...s, visitDarts: s.visitDarts + 1 } }

        const dart: Dart = e.data.dart
        const scored = scoreDart(seat.left, dart, 'double', '25_50')
        if (scored === 'bust') {
          return {
            state: { ...s, seats: withSeat(s, cp, { left: s.visitStartLeft }), bust: true, visitDarts: s.visitDarts + 1, lastResult: null },
          }
        }
        return {
          state: {
            ...s,
            seats: withSeat(s, cp, { left: scored }),
            visitDarts: s.visitDarts + 1,
            finishLabel: scored === 0 ? dartLabel(dart.segment) : s.finishLabel,
            lastResult: null,
          },
        }
      }

      case 'takeout.finished':
      case 'visit.cleared': {
        if (s.phase === 'finished') return { state: s }
        return { state: afterVisit(s, s.seats[s.currentPlayer].left === 0) }
      }

      default:
        return { state: s }
    }
  },

  onUserAction: (s: Catch40State, _a: UserAction) => ({ state: s }),

  view(s: Catch40State): Catch40View {
    return {
      phase: s.phase,
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s, s => afterVisit(s, s.seats[s.currentPlayer].left === 0)),
      winner: s.winner,
      visitLocked: locked(s),
      bust: s.bust,
      visitStartLeft: s.visitStartLeft,
      seats: s.seats.map(seat => ({
        target: targetOf(seat),
        left: seat.left,
        darts: seat.darts,
        tries: seat.tries,
        total: totalOf(seat),
        done: isDone(seat),
      })),
      lastResult: s.lastResult,
    }
  },

  // Seats in the order they throw (a bull off may have changed it)
  throwOrder: s => [...s.order],

  summarize(s: Catch40State, { totalDarts }): SeatResult[] {
    // No winner given: seats with the same total share a place
    const placements = rankSeats(s.seats.length, null, (a, b) => compareSeats(s.seats[a], s.seats[b]))
    return s.seats.map((seat, i) => ({
      placement: placements[i],
      stats: {
        total: totalOf(seat),
        checkouts: made(seat).length,
        targets: seat.tries.length,
        dartsThrown: totalDarts[i] ?? 0,
        ...(made(seat).length > 0 && { avgDarts: avgDarts(seat) }),
      },
    }))
  },

  detail(_visits: CommittedVisit<Catch40State>[], final: Catch40State): Catch40Detail {
    return { mode: 'catch40', seats: final.seats.map(seat => ({ tries: seat.tries, total: totalOf(seat) })) }
  },

  matchStats(_visits: CommittedVisit<Catch40State>[], final: Catch40State): MatchStats {
    return {
      rows: MATCH_STATS_ROWS,
      seats: final.seats.map((seat, index) => ({
        index,
        values: values({ total: totalOf(seat), targets: seat.tries.length, checkouts: made(seat).length, avgDarts: avgDarts(seat) }),
      })),
    }
  },
}

/** Catch 40 with a bull off (off by default): what's registered in games/index.ts. */
export const catch40Module = withBullOff(catch40Game, {
  applyStartOrder: (s, order) => ({ ...s, order, turn: 0, currentPlayer: order[0], visitStartLeft: s.seats[order[0]].left }),
})
