// 121 Checkout: a solo/multiplayer checkout drill. Each try throws at a target until it's
// checked out or the try's darts run out; a made try moves the target up, a missed one
// follows the miss rule. See docs/superpowers/specs/2026-10-16-p121-design.md.
import type {
  ConfigFieldMeta,
  GameModule,
  Player,
  BoardEvent,
  CommittedVisit,
  Dart,
  MatchStats,
  P121Detail,
  SeatResult,
  UserAction,
} from '../session/types.js'
import type { P121View } from '../session/views.js'
import { withBullOff } from '../session/withBullOff.js'
import { scoreDart } from './outRules.js'
import type { OutMode } from './outRules.js'
import { checkoutHint } from '../shared/checkout.js'
import { rankSeats } from './ranking.js'
import { row, values } from './matchStats.js'

export type P121Config = {
  startTarget: number
  tries: number
  dartsPerTry: number
  outMode: OutMode
  missRule: 'reset' | 'down' | 'stay'
  lock: boolean
  bullOff: 'off' | 'wdc' | 'pdc'
}

export type P121Try = { target: number; made: boolean; darts: number; finish: string | null }

export type P121Seat = {
  /** Finished tries, oldest first. */
  tries: P121Try[]
  /** The open try's target. */
  target: number
  /** Points left in the open try. */
  left: number
  /** Darts used by the open try's committed visits. */
  darts: number
  /** Points scored by each committed visit of the open try (0 on a bust). */
  visits: number[]
  /** Lowest target a miss can drop to (startTarget, or a locked target). */
  floor: number
  /** Finishing dart label → darts thrown when one dart could finish. */
  attempts: Record<string, number>
  /** Finishing dart label → checkouts with it. */
  hits: Record<string, number>
}

export type P121Result = { seat: number; target: number; made: boolean; darts: number; next: number }

export type P121State = {
  cfg: P121Config
  seats: P121Seat[]
  order: number[]
  turn: number
  currentPlayer: number
  visitStartLeft: number
  visitDarts: number
  bust: boolean
  phase: 'game' | 'finished'
  winner: number | null
  lastResult: P121Result | null
  /** The label of the dart that just finished the open try, if any; reset on visit.opened,
   *  read by endVisit when the visit checks out. */
  finishLabel: string | null
}

export function nextTarget(t: { target: number; made: boolean; darts: number }, cfg: P121Config, floor: number) {
  const lockedFloor = cfg.lock && t.made && t.darts <= 3 ? Math.max(floor, t.target) : floor
  if (t.made) return { target: t.target + 1, floor: lockedFloor }
  const missed = cfg.missRule === 'reset' ? cfg.startTarget : cfg.missRule === 'down' ? t.target - 1 : t.target
  return { target: Math.max(missed, cfg.startTarget, floor), floor }
}

export function dartLabel(seg: { number: number; multiplier: number }): string {
  if (seg.number === 0 || seg.multiplier === 0) return 'Miss'
  if (seg.number === 50 || (seg.number === 25 && seg.multiplier === 2)) return 'Bull'
  if (seg.number === 25) return '25'
  if (seg.multiplier === 3) return `T${seg.number}`
  if (seg.multiplier === 2) return `D${seg.number}`
  return `${seg.number}`
}

function bumpCount(counts: Record<string, number>, label: string): Record<string, number> {
  return { ...counts, [label]: (counts[label] ?? 0) + 1 }
}

function withSeat(s: P121State, i: number, patch: Partial<P121Seat>): P121Seat[] {
  return s.seats.map((seat, j) => (j === i ? { ...seat, ...patch } : seat))
}

// Pushes the finished try, moves the target on and records lastResult; shared by endVisit
// (a checkout, or the try's darts running out) and give up (which forces a try to end early).
function finishTry(s: P121State, made: boolean, used: number): P121State {
  const cp = s.currentPlayer
  const seat = s.seats[cp]
  const finishedTry: P121Try = { target: seat.target, made, darts: used, finish: made ? s.finishLabel : null }
  const { target, floor } = nextTarget({ target: seat.target, made, darts: used }, s.cfg, seat.floor)
  const seats = withSeat(s, cp, { tries: [...seat.tries, finishedTry], target, left: target, darts: 0, visits: [], floor })
  const lastResult: P121Result = { seat: cp, target: seat.target, made, darts: used, next: target }
  return { ...s, seats, lastResult }
}

// Commits the open visit: pushes a finished try once it's made or out of darts, otherwise
// just records the visit and lets the try go on.
function endVisit(s: P121State, made: boolean): P121State {
  const cp = s.currentPlayer
  const seat = s.seats[cp]
  const used = made ? seat.darts + s.visitDarts : seat.darts + 3
  if (!(made || used >= s.cfg.dartsPerTry)) {
    const scored = s.visitStartLeft - seat.left
    return { ...s, seats: withSeat(s, cp, { darts: used, visits: [...seat.visits, scored] }) }
  }
  return finishTry(s, made, used)
}

// Give up: ends the open try as missed right away, counting only the darts of its committed
// visits, not a full dartsPerTry. Only between visits (see onUserAction).
function giveUp(s: P121State): P121State {
  return finishTry(s, false, s.seats[s.currentPlayer].darts)
}

// The next turn in order whose seat still has tries left; the game ends when none does.
function advance(s: P121State): P121State {
  const n = s.order.length
  for (let i = 1; i <= n; i++) {
    const turn = (s.turn + i) % n
    const seat = s.order[turn]
    if (s.seats[seat].tries.length < s.cfg.tries) {
      return { ...s, turn, currentPlayer: seat, visitStartLeft: s.seats[seat].left, visitDarts: 0, bust: false }
    }
  }
  return { ...s, phase: 'finished', winner: rankWinner(s) }
}

// The open visit is decided (a checkout or a bust) and only waits for takeout.
function locked(s: P121State): boolean {
  return s.bust || s.seats[s.currentPlayer].left === 0
}

// Who throws after the open visit, by the same rotation advance() would apply if it
// committed right now; null once the game is over, or when this visit would end it.
function upNext(s: P121State): number | null {
  if (s.phase === 'finished') return null
  const made = s.seats[s.currentPlayer].left === 0
  const after = advance(endVisit(s, made))
  return after.phase === 'finished' ? null : after.currentPlayer
}

function rankKey(seat: P121Seat): [number, number, number] {
  const made = seat.tries.filter(t => t.made)
  const highest = made.length ? Math.max(...made.map(t => t.target)) : 0
  const darts = made.reduce((sum, t) => sum + t.darts, 0)
  return [-highest, -made.length, darts]
}

/** Negative: `a` is ahead (higher made target, then more checkouts, then fewer darts over made
 *  tries). Equal seats compare 0 — it leaves out the seat index on purpose. */
export function compareSeats(a: P121Seat, b: P121Seat): number {
  const [ha, ca, da] = rankKey(a)
  const [hb, cb, db] = rankKey(b)
  return ha - hb || ca - cb || da - db
}

// The lower seat index breaks a tie that compareSeats leaves at 0.
function rankWinner(s: P121State): number {
  let winner = 0
  for (let i = 1; i < s.seats.length; i++) {
    if (compareSeats(s.seats[i], s.seats[winner]) < 0) winner = i
  }
  return winner
}

type Run = { length: number; from: number; to: number }

// The longest run of consecutive made tries; on equal lengths the later run wins (>= keeps it).
function bestRun(tries: P121Try[]): Run | null {
  let best: Run | null = null
  let i = 0
  while (i < tries.length) {
    if (!tries[i].made) {
      i++
      continue
    }
    let j = i
    while (j < tries.length && tries[j].made) j++
    const run: Run = { length: j - i, from: tries[i].target, to: tries[j - 1].target }
    if (!best || run.length >= best.length) best = run
    i = j
  }
  return best
}

// The made try with the fewest darts; on equal darts, the higher target wins.
function fastestCheckout(made: P121Try[]): { darts: number; target: number } | null {
  if (made.length === 0) return null
  const best = made.reduce((a, b) => (b.darts < a.darts || (b.darts === a.darts && b.target > a.target) ? b : a))
  return { darts: best.darts, target: best.target }
}

// Made tries grouped by darts used, ascending.
function dartsPerCheckout(made: P121Try[]): { darts: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const t of made) counts.set(t.darts, (counts.get(t.darts) ?? 0) + 1)
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([darts, count]) => ({ darts, count }))
}

// Finishing doubles with hits and attempts, most attempted first, then by label. A label can
// appear in only one of the two maps (under master or straight out a dart other than the
// hinted double can finish, so its hit is recorded under its own label).
function doubles(seat: P121Seat): { label: string; hits: number; attempts: number }[] {
  const labels = new Set([...Object.keys(seat.attempts), ...Object.keys(seat.hits)])
  return [...labels]
    .map(label => ({ label, hits: seat.hits[label] ?? 0, attempts: seat.attempts[label] ?? 0 }))
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label))
}

const MATCH_STATS_ROWS = [
  row('checkouts', 'Checkouts', 'ratio', 'higher', { of: 'tries' }),
  row('highestMade', 'Highest made', 'integer', 'higher', { compact: true }),
  row('avgDarts', 'Average darts', 'decimal', 'lower'),
  row('fastest', 'Fastest checkout', 'integer', 'lower', { compact: true }),
]

export const configMeta: Record<Exclude<keyof P121Config, 'bullOff'>, ConfigFieldMeta> = {
  startTarget: {
    label: 'Start target',
    options: [
      { value: 81, label: '81' },
      { value: 101, label: '101' },
      { value: 121, label: '121' },
    ],
  },
  tries: {
    label: 'Tries',
    options: [
      { value: 5, label: '5' },
      { value: 10, label: '10' },
      { value: 20, label: '20' },
    ],
  },
  dartsPerTry: {
    label: 'Darts per try',
    options: [
      { value: 3, label: '3' },
      { value: 6, label: '6' },
      { value: 9, label: '9' },
      { value: 12, label: '12' },
    ],
  },
  outMode: {
    label: 'Check-out',
    tooltip: 'How a try finishes. Straight: any dart on 0. Double: must finish on a double. Master: double or triple.',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'double', label: 'Double' },
      { value: 'master', label: 'Master' },
    ],
  },
  missRule: {
    label: 'Miss rule',
    tooltip: 'What happens to the target after a missed try.',
    options: [
      { value: 'reset', label: 'Back to start' },
      { value: 'down', label: 'Down one' },
      { value: 'stay', label: 'Stay' },
    ],
  },
  lock: {
    label: 'Lock',
    tooltip: 'A target checked out in 3 darts or fewer becomes a floor: a miss never drops you below it.',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
}

/** 121 without a bull off; the wrapper that adds one (and `bullOff` to the config) is added
 *  where this module is registered. */
export const p121Game: GameModule<P121State, P121Config, P121View, 'p121', P121Detail> = {
  id: 'p121',
  version: 1,
  // bullOff is also set by withBullOff once this module is wrapped, same as x01Game.
  defaultConfig: {
    startTarget: 121,
    tries: 10,
    dartsPerTry: 9,
    outMode: 'double',
    missRule: 'reset',
    lock: false,
    bullOff: 'off',
  },
  configMeta,

  // Configs come from the client: each field must be one of its options (strict, so '121' isn't 121)
  validate(cfg: P121Config): string | null {
    const values: Record<string, unknown> = cfg
    for (const [key, meta] of Object.entries(configMeta)) {
      if (!meta.options?.some(o => o.value === values[key])) return `Unknown ${meta.label.toLowerCase()}`
    }
    return null
  },

  init(cfg: P121Config, players: Player[]): P121State {
    const n = players.length
    const seats: P121Seat[] = Array.from({ length: n }, () => ({
      tries: [],
      target: cfg.startTarget,
      left: cfg.startTarget,
      darts: 0,
      visits: [],
      floor: cfg.startTarget,
      attempts: {},
      hits: {},
    }))
    return {
      cfg,
      seats,
      order: Array.from({ length: n }, (_, i) => i),
      turn: 0,
      currentPlayer: 0,
      visitStartLeft: cfg.startTarget,
      visitDarts: 0,
      bust: false,
      phase: 'game',
      winner: null,
      lastResult: null,
      finishLabel: null,
    }
  },

  getCurrentPlayer(s: P121State): number {
    return s.currentPlayer
  },

  onBoardEvent(s: P121State, e: BoardEvent): { state: P121State } {
    switch (e.kind) {
      case 'visit.opened':
        return { state: { ...s, visitStartLeft: s.seats[s.currentPlayer].left, visitDarts: 0, bust: false, finishLabel: null } }

      case 'dart.detected': {
        const cp = s.currentPlayer
        const seat = s.seats[cp]
        // A checkout mid-visit ends the visit; leftover darts in it aren't needed and don't count.
        if (seat.left === 0) return { state: s }
        if (s.phase === 'finished' || s.bust) {
          return { state: { ...s, visitDarts: s.visitDarts + 1 } }
        }

        const dart: Dart = e.data.dart
        const hint = checkoutHint(seat.left, s.cfg.outMode, 1)
        const hintLabel = hint ? hint[0] : null
        const attempts = hintLabel ? bumpCount(seat.attempts, hintLabel) : seat.attempts

        const scored = scoreDart(seat.left, dart, s.cfg.outMode, '25_50')
        if (scored === 'bust') {
          return {
            state: {
              ...s,
              seats: withSeat(s, cp, { left: s.visitStartLeft, attempts }),
              bust: true,
              visitDarts: s.visitDarts + 1,
              lastResult: null,
            },
          }
        }

        if (scored === 0) {
          // The attempt (above) is the hint's double; the hit is whatever dart actually finished
          // it — under master or straight out those can differ (e.g. T10 finishes a hinted D15).
          const label = dartLabel(dart.segment)
          return {
            state: {
              ...s,
              seats: withSeat(s, cp, { left: scored, attempts, hits: bumpCount(seat.hits, label) }),
              visitDarts: s.visitDarts + 1,
              finishLabel: label,
              lastResult: null,
            },
          }
        }

        return {
          state: { ...s, seats: withSeat(s, cp, { left: scored, attempts }), visitDarts: s.visitDarts + 1, lastResult: null },
        }
      }

      case 'takeout.finished':
      case 'visit.cleared': {
        if (s.phase === 'finished') return { state: s }
        const made = s.seats[s.currentPlayer].left === 0
        return { state: advance(endVisit(s, made)) }
      }

      default:
        return { state: s }
    }
  },

  onUserAction(s: P121State, a: UserAction): { state: P121State } {
    // Give up waits until the visit's darts are out of the board: the engine drops the open
    // visit on a module action, so the board's later takeout would commit an empty visit.
    if (a.type === 'p121_give_up' && s.phase === 'game' && s.visitDarts === 0) return { state: advance(giveUp(s)) }
    return { state: s }
  },

  view(s: P121State): P121View {
    const seats = s.seats.map(seat => {
      const made = seat.tries.filter(t => t.made)
      const highestMade = made.length ? Math.max(...made.map(t => t.target)) : null
      const avgDarts = made.length ? made.reduce((sum, t) => sum + t.darts, 0) / made.length : null
      return {
        target: seat.target,
        left: seat.left,
        darts: seat.darts,
        visits: seat.visits,
        floor: seat.floor,
        tries: seat.tries,
        made: made.length,
        highestMade,
        avgDarts,
        done: seat.tries.length >= s.cfg.tries,
      }
    })
    return {
      cfg: {
        startTarget: s.cfg.startTarget,
        tries: s.cfg.tries,
        dartsPerTry: s.cfg.dartsPerTry,
        outMode: s.cfg.outMode,
        missRule: s.cfg.missRule,
        lock: s.cfg.lock,
      },
      phase: s.phase,
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s),
      winner: s.winner,
      visitLocked: locked(s),
      bust: s.bust,
      visitStartLeft: s.visitStartLeft,
      seats,
      lastResult: s.lastResult,
    }
  },

  summarize(s: P121State): SeatResult[] {
    const placements = rankSeats(s.seats.length, s.winner, (a, b) => compareSeats(s.seats[a], s.seats[b]))
    return s.seats.map((seat, i) => {
      const made = seat.tries.filter(t => t.made)
      return {
        placement: placements[i],
        stats: {
          checkouts: made.length,
          tries: seat.tries.length,
          bestRun: bestRun(seat.tries)?.length ?? 0,
          ...(made.length > 0 && {
            highestMade: Math.max(...made.map(t => t.target)),
            avgDarts: made.reduce((sum, t) => sum + t.darts, 0) / made.length,
          }),
        },
      }
    })
  },

  detail(_visits: CommittedVisit<P121State>[], final: P121State): P121Detail {
    return {
      mode: 'p121',
      seats: final.seats.map(seat => {
        const made = seat.tries.filter(t => t.made)
        return {
          tries: seat.tries,
          doubles: doubles(seat),
          dartsPerCheckout: dartsPerCheckout(made),
          bestRun: bestRun(seat.tries),
          highestReached: Math.max(seat.target, ...seat.tries.map(t => t.target)),
          fastest: fastestCheckout(made),
        }
      }),
    }
  },

  matchStats(_visits: CommittedVisit<P121State>[], final: P121State): MatchStats {
    return {
      rows: MATCH_STATS_ROWS,
      seats: final.seats.map((seat, index) => {
        const made = seat.tries.filter(t => t.made)
        return {
          index,
          values: values({
            tries: seat.tries.length,
            checkouts: made.length,
            highestMade: made.length > 0 ? Math.max(...made.map(t => t.target)) : undefined,
            avgDarts: made.length > 0 ? made.reduce((sum, t) => sum + t.darts, 0) / made.length : undefined,
            fastest: made.length > 0 ? Math.min(...made.map(t => t.darts)) : undefined,
          }),
        }
      }),
    }
  },
}

/** 121 with a bull off (off by default): what's registered in games/index.ts. */
export const p121Module = withBullOff(p121Game, {
  applyStartOrder: (s, order) => ({ ...s, order, turn: 0, currentPlayer: order[0], visitStartLeft: s.seats[order[0]].left }),
})
