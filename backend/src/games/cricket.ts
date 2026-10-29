// Cricket's reducer: wires cricketRules (marks, scoring, leg win) into a GameModule, copying
// X01's shape for legs and teams.
import type {
  CommittedVisit,
  CricketDetail,
  GameModule,
  BoardEvent,
  Player,
  ConfigFieldMeta,
  SeatResult,
  SummaryContext,
} from '../session/types.js'
import { withBullOff } from '../session/withBullOff.js'
import type { CricketView } from '../session/views.js'
import type { Rng } from '../session/rng.js'
import { validateOptions } from './configMeta.js'
import { nextTurn, upNext } from './turns.js'
import { cricketMatchStats } from './cricketStats.js'
import { rankSeats } from './ranking.js'
import { legStart, seatPlacements, seatsByTeam, teamCount, teamOfSeats, turnOrder, validateTwoTeams, type TeamsConfig } from './teams.js'
import { OPEN, TARGETS, emptyMarks, marksFor, applyMarks, legWinner, type CricketMode, type Marks } from './cricketRules.js'

export type CricketConfig = {
  mode: CricketMode
  firstTo: number
  bullOff: 'off' | 'wdc' | 'pdc'
  botSpeed: 'fast' | 'normal' | 'slow'
} & TeamsConfig

/** A committed visit: marks counted and points scored, for the chalkboard. */
export type CricketVisitRecord = { seat: number; marks: number; points: number; darts: number }

const TEAM_IDS = ['A', 'B'] as const

/**
 * `board` and `legs` are per team (index: `teamOf[seat]`); in singles every seat is its own
 * team, so they are per seat. The personal stats (`marksScored`, `dartsThrown`, `targetMarks`)
 * are always per seat.
 */
export type CricketState = {
  cfg: CricketConfig
  /** The team index of every seat; in singles the seat itself. */
  teamOf: number[]
  board: Marks
  legs: number[]
  phase: 'game' | 'finished'
  /** Throwing order (seats) for the whole game, as in X01. */
  order: number[]
  /** Position of the open turn in `order`. */
  turn: number
  currentPlayer: number
  round: number
  /** The winning team. */
  winner: number | null
  /** The team that won the open leg on a dart of this visit; the takeout commits it. */
  legWonBy: number | null
  playerCount: number
  visitDarts: number
  /** Counted marks this visit. */
  visitMarks: number
  /** `scored` this visit. */
  visitPoints: number
  /** Per seat, counted marks (MPR). */
  marksScored: number[]
  /** Per seat. */
  dartsThrown: number[]
  /** Per seat, counted marks per target. */
  targetMarks: number[][]
  /** This leg's committed visits, in throwing order. */
  legVisits: CricketVisitRecord[]
  /** Each player's last committed visit, kept across legs; null before their first. */
  lastVisit: (CricketVisitRecord | null)[]
}

// Ends the open visit for its thrower: its record and the per-player totals that count it
function committedVisit(
  s: CricketState,
): Pick<CricketState, 'dartsThrown' | 'legVisits' | 'lastVisit' | 'visitDarts' | 'visitMarks' | 'visitPoints'> {
  const cp = s.currentPlayer
  const record: CricketVisitRecord = { seat: cp, marks: s.visitMarks, points: s.visitPoints, darts: s.visitDarts }
  return {
    dartsThrown: s.dartsThrown.map((d, i) => (i === cp ? d + s.visitDarts : d)),
    legVisits: [...s.legVisits, record],
    lastVisit: s.lastVisit.map((v, i) => (i === cp ? record : v)),
    visitDarts: 0,
    visitMarks: 0,
    visitPoints: 0,
  }
}

function freshLeg(s: CricketState, legs: number[]): Partial<CricketState> {
  const turn = legStart(s.order, legs)
  return {
    board: emptyMarks(teamCount(s.teamOf)),
    legWonBy: null,
    round: 1,
    legVisits: [],
    turn,
    currentPlayer: s.order[turn],
  }
}

// The takeout: commits the open visit, then the leg win it holds (the next leg, or the game) or
// the next turn in `order`, a new round when that gets back to the leg's start
function commit(s: CricketState): CricketState {
  const done = committedVisit(s)
  if (s.legWonBy !== null) {
    const legs = s.legs.map((l, i) => (i === s.legWonBy ? l + 1 : l))
    if (legs[s.legWonBy] >= s.cfg.firstTo) return { ...s, ...done, legs, winner: s.legWonBy, phase: 'finished' }
    return { ...s, ...done, legs, ...freshLeg(s, legs) }
  }
  // Every seat throws in turn, so only a game without seats has no next one
  const next = nextTurn(s.order, s.turn, () => true) ?? { turn: s.turn, seat: s.currentPlayer }
  const round = next.turn === legStart(s.order, s.legs) ? s.round + 1 : s.round
  return { ...s, ...done, currentPlayer: next.seat, turn: next.turn, round }
}

// `teams` and `teamStart` are set by the lobby, not the setup form
export const configMeta: Record<Exclude<keyof CricketConfig, 'teams' | 'teamStart'>, ConfigFieldMeta> = {
  format: {
    label: 'Format',
    tooltip: 'Teams: Team A against Team B, each sharing one score. Players take turns across the teams.',
    options: [
      { value: 'singles', label: 'Singles' },
      { value: 'teams', label: 'Teams' },
    ],
  },
  mode: {
    label: 'Mode',
    tooltip: "Standard: points go to you. Cut-throat: points go to every opponent who hasn't opened the number, and the lowest score wins.",
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'cutthroat', label: 'Cut-throat' },
    ],
  },
  bullOff: {
    label: 'Bull off',
    tooltip:
      'Who throws first. Off: player 1 starts. One dart each, closest to the bull goes first. The same bull segment twice is thrown again. If nobody hits a bull, WDC measures the distance and PDC throws again.',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'wdc', label: 'WDC' },
      { value: 'pdc', label: 'PDC' },
    ],
  },
  botSpeed: {
    label: 'Bot speed',
    tooltip: 'How fast a bot seat throws its darts.',
    options: [
      { value: 'fast', label: 'Fast' },
      { value: 'normal', label: 'Normal' },
      { value: 'slow', label: 'Slow' },
    ],
  },
  firstTo: {
    label: 'First to',
    tooltip: 'Number of legs needed to win the match.',
  },
}

/** Cricket without a bull off; `cricketModule` below adds it. */
export const cricketGame: GameModule<CricketState, CricketConfig, CricketView, 'cricket', CricketDetail> = {
  id: 'cricket',
  version: 1,
  defaultConfig: {
    mode: 'standard',
    firstTo: 1,
    bullOff: 'off',
    botSpeed: 'normal',
    format: 'singles',
  },
  configMeta,
  teams: true,

  // The bull off is checked here too: it is in configMeta
  validate(cfg: CricketConfig, players: Player[]): string | null {
    if (!Number.isInteger(cfg.firstTo) || cfg.firstTo < 1) return 'First to must be at least 1'
    return validateTwoTeams(cfg, players) ?? validateOptions(cfg, configMeta)
  },

  init(cfg: CricketConfig, players: Player[], rng?: Rng): CricketState {
    const n = players.length
    const teamOf = teamOfSeats(cfg, n)
    const teams = teamCount(teamOf)
    const startTeam = cfg.format === 'teams' && cfg.teamStart === 'random' && rng ? (rng() < 0.5 ? 0 : 1) : 0
    const order = turnOrder(teamOf, startTeam)
    return {
      cfg,
      teamOf,
      board: emptyMarks(teams),
      legs: Array<number>(teams).fill(0),
      phase: 'game',
      order,
      turn: 0,
      currentPlayer: order[0],
      round: 1,
      winner: null,
      legWonBy: null,
      playerCount: n,
      visitDarts: 0,
      visitMarks: 0,
      visitPoints: 0,
      marksScored: Array<number>(n).fill(0),
      dartsThrown: Array<number>(n).fill(0),
      targetMarks: Array.from({ length: n }, () => TARGETS.map(() => 0)),
      legVisits: [],
      lastVisit: Array<CricketVisitRecord | null>(n).fill(null),
    }
  },

  getCurrentPlayer(s: CricketState): number {
    return s.currentPlayer
  },

  teamsOf(s: CricketState): number[] {
    return s.teamOf
  },

  onBoardEvent(s: CricketState, e: BoardEvent): { state: CricketState } {
    switch (e.kind) {
      case 'visit.opened': {
        return { state: { ...s, visitDarts: 0, visitMarks: 0, visitPoints: 0 } }
      }

      case 'dart.detected': {
        if (s.phase === 'finished' || s.legWonBy !== null) return { state: s }

        const thrown = { ...s, visitDarts: s.visitDarts + 1 }
        const m = marksFor(e.data.dart, s.board.targets)
        if (!m) return { state: thrown }

        const cp = s.currentPlayer
        const team = s.teamOf[cp]
        const { board, counted, scored } = applyMarks(s.board, team, m.target, m.marks, s.cfg.mode)
        return {
          state: {
            ...thrown,
            board,
            visitMarks: s.visitMarks + counted,
            visitPoints: s.visitPoints + scored,
            marksScored: s.marksScored.map((v, i) => (i === cp ? v + counted : v)),
            targetMarks: s.targetMarks.map((row, i) => (i === cp ? row.map((v, ti) => (ti === m.target ? v + counted : v)) : row)),
            legWonBy: legWinner(board, team, s.cfg.mode),
          },
        }
      }

      case 'takeout.finished':
      case 'visit.cleared':
        return { state: commit(s) }

      default:
        return { state: s }
    }
  },

  onUserAction(s: CricketState): { state: CricketState } {
    return { state: s }
  },

  // Per seat: each seat shows its team's marks, points and legs (in a team game the winner is
  // a seat: the winning team's first seat, as X01; `teams` has the team results).
  view(s: CricketState): CricketView {
    const myTeam = s.teamOf[s.currentPlayer]
    const closed = TARGETS.map((_, i) => s.board.marks.every(row => row[i] >= OPEN))
    const scorable = TARGETS.map(
      (_, i) => s.board.marks[myTeam][i] >= OPEN && s.board.marks.some((row, t) => t !== myTeam && row[i] < OPEN),
    )
    const view: CricketView = {
      config: { mode: s.cfg.mode, firstTo: s.cfg.firstTo, botSpeed: s.cfg.botSpeed },
      phase: s.phase,
      targets: [...s.board.targets],
      marks: s.teamOf.map(t => s.board.marks[t]),
      points: s.teamOf.map(t => s.board.points[t]),
      legs: s.teamOf.map(t => s.legs[t]),
      firstTo: s.cfg.firstTo,
      closed,
      scorable,
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s, commit),
      round: s.round,
      winner: s.winner === null ? null : s.teamOf.indexOf(s.winner),
      visitLocked: s.legWonBy !== null,
      marksScored: s.marksScored,
      dartsThrown: s.dartsThrown,
      lastVisit: s.lastVisit,
    }
    if (s.cfg.format !== 'teams') return view
    const teams = seatsByTeam(s.teamOf).map((seats, t) => ({
      id: TEAM_IDS[t],
      name: `Team ${TEAM_IDS[t]}`,
      seats,
      points: s.board.points[t],
      legs: s.legs[t],
    }))
    return { ...view, teams }
  },

  getLeg(s: CricketState): number {
    return s.legs.reduce((a, b) => a + b, 0)
  },

  // Every seat once, in the order they first throw (`order` repeats seats for uneven teams)
  throwOrder(s: CricketState): number[] {
    return [...new Set(s.order)]
  },

  // Teams are ranked (in singles every seat is a team); every seat shares its team's place.
  // Standard: more legs, then more points, then more targets opened wins each tie; cut-throat
  // flips points (fewer first, since the lowest score wins).
  summarize(s: CricketState, ctx: SummaryContext): SeatResult[] {
    const openedCount = (t: number) => s.board.marks[t].filter(m => m >= OPEN).length
    const teamPlaces = rankSeats(teamCount(s.teamOf), s.winner, (a, b) => {
      if (s.legs[b] !== s.legs[a]) return s.legs[b] - s.legs[a]
      const points = s.cfg.mode === 'standard' ? s.board.points[b] - s.board.points[a] : s.board.points[a] - s.board.points[b]
      if (points !== 0) return points
      return openedCount(b) - openedCount(a)
    })
    const placements = seatPlacements(s.teamOf, teamPlaces)
    return placements.map((placement, i) => {
      const darts = ctx.totalDarts[i] ?? 0
      return {
        placement,
        stats: {
          mpr: darts > 0 ? (s.marksScored[i] / darts) * 3 : 0,
          marksScored: s.marksScored[i],
          dartsThrown: darts,
          legsWon: s.legs[s.teamOf[i]],
          points: s.board.points[s.teamOf[i]],
        },
      }
    })
  },

  detail(visits: CommittedVisit<CricketState>[], final: CricketState): CricketDetail {
    const legs: CricketDetail['legs'] = []
    for (const v of visits) {
      if (v.phase !== 'game') continue
      let leg = legs.find(l => l.leg === v.leg)
      if (!leg) {
        leg = { leg: v.leg, starter: v.seat, winner: null, marks: [], points: [], visits: [] }
        legs.push(leg)
      }
      // Cut-throat with 3+ players: a team can win on another team's dart, so check every
      // team's legs, not just the thrower's.
      const won = v.after.legs.findIndex((l, t) => l > v.start.legs[t])
      if (won >= 0) leg.winner = v.start.teamOf.indexOf(won)
      leg.marks = v.end.board.marks
      leg.points = v.end.board.points
      leg.visits.push({
        visit: v.visit,
        seat: v.seat,
        committedAt: v.committedAt,
        darts: v.darts,
        marks: v.end.visitMarks,
        points: v.end.visitPoints,
      })
    }
    const targets = [...final.board.targets]
    if (final.cfg.format !== 'teams') return { mode: 'cricket', targets, legs }
    const teams = seatsByTeam(final.teamOf).map((seats, t) => ({ id: TEAM_IDS[t], name: `Team ${TEAM_IDS[t]}`, seats }))
    return { mode: 'cricket', targets, teams, legs }
  },

  matchStats: cricketMatchStats,
}

/** Cricket with an optional bull off deciding the throwing order. */
// In a team game the bull off winner throws first and the teams take turns
export const cricketModule = withBullOff(cricketGame, {
  applyStartOrder: (s, bullOffOrder) => {
    const winner = bullOffOrder[0]
    const order = s.cfg.format === 'teams' ? turnOrder(s.teamOf, s.teamOf[winner], winner) : bullOffOrder
    return { ...s, order, turn: 0, currentPlayer: order[0] }
  },
})
