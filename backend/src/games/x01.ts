import type { GameModule, BoardEvent, Player, Dart, ConfigFieldMeta, Point, X01Detail, SeatResult } from '../session/types.js'
import { withBullOff } from '../session/withBullOff.js'
import type { X01View } from '../session/views.js'
import type { Rng } from '../session/rng.js'
import { pickTarget } from '../bots/accuracy.js'
import { rankSeats } from './ranking.js'
import { checkoutHint } from '../shared/checkout.js'
import { seatPlacements, seatsByTeam, teamCount, teamOfSeats, turnOrder, type TeamsConfig } from './teams.js'
import { x01MatchStats } from './x01Stats.js'

export type X01Config = {
  /** Any score; the setup offers 301, 501 and 701. */
  startScore: number
  inMode: 'straight' | 'double' | 'master'
  outMode: 'straight' | 'double' | 'master'
  bullOff: 'off' | 'wdc' | 'pdc'
  bullValue: '25_50' | '50_50'
  maxRounds: number
  firstTo: number
  /** How fast a bot seat throws. Only shown in GameSettings when a bot is in the lobby. */
  botSpeed: 'fast' | 'normal' | 'slow'
} & TeamsConfig

/** A committed visit: for the Chalkboard, the leg average and the last visit. */
export type X01VisitRecord = {
  seat: number
  /** Points the visit scored; 0 on a bust or before opening. */
  scored: number
  /** The team's score after it. */
  left: number
  bust: boolean
  darts: number
}

/**
 * `scores`, `legs`, `opened` and `visitOpenedScores` are per team (index: `teamOf[seat]`);
 * in singles every seat is its own team, so they are per seat. The personal stats
 * (`pointsScored`, `bestCheckout`) are always per seat.
 */
export type X01State = {
  cfg: X01Config
  /** The team index of every seat; in singles the seat itself. */
  teamOf: number[]
  scores: number[]
  legs: number[]
  opened: boolean[]
  phase: 'game' | 'finished'
  /**
   * Throwing order (seats) for the whole game: seat order, a bull off's order, or the
   * teams taking turns (a seat repeats when the teams are uneven).
   */
  order: number[]
  /** Position of the open turn in `order`. */
  turn: number
  currentPlayer: number
  round: number
  bustThisVisit: boolean
  /**
   * Scores at the start of the open visit. Taken when the previous visit is committed
   * (and again on visit.opened), so it is right even when a board.resync drops the
   * visit.opened: a bust reverts to it and withVisitScored counts from it.
   */
  visitOpenedScores: number[]
  /** The winning team (in singles the seat). */
  winner: number | null
  playerCount: number
  /** Points each player scored, busts counting 0; for the 3-dart average. */
  pointsScored: number[]
  /** Each player's highest checkout (the score left when the checkout visit started); 0 = none yet. */
  bestCheckout: number[]
  /** Darts thrown in the open visit, scoring or not. */
  visitDarts: number
  /** This leg's committed visits, in throwing order. */
  legVisits: X01VisitRecord[]
  /** Each player's last committed visit, kept across legs; null before their first. */
  lastVisit: (X01VisitRecord | null)[]
  /** Darts in each player's committed visits: with pointsScored, the match average. */
  dartsThrown: number[]
  /** Darts each player threw on a one-dart finish, wherever they landed (opened players only). */
  checkoutAttempts: number[]
  /** Of those, the darts that finished the leg. */
  checkoutHits: number[]
}

// What the current player's visit scored: a bust resets the score and an unopened
// player doesn't score, so the difference from the visit's start is exact
function withVisitScored(s: X01State): number[] {
  const cp = s.currentPlayer
  const t = s.teamOf[cp]
  return s.pointsScored.map((p, i) => (i === cp ? p + s.visitOpenedScores[t] - s.scores[t] : p))
}

// Ends the open visit for its thrower: its record and the per-player totals that count it
function committedVisit(s: X01State): Pick<X01State, 'pointsScored' | 'dartsThrown' | 'legVisits' | 'lastVisit' | 'visitDarts'> {
  const cp = s.currentPlayer
  const t = s.teamOf[cp]
  const record: X01VisitRecord = {
    seat: cp,
    scored: s.visitOpenedScores[t] - s.scores[t],
    left: s.scores[t],
    bust: s.bustThisVisit,
    darts: s.visitDarts,
  }
  return {
    pointsScored: withVisitScored(s),
    dartsThrown: s.dartsThrown.map((d, i) => (i === cp ? d + s.visitDarts : d)),
    legVisits: [...s.legVisits, record],
    lastVisit: s.lastVisit.map((v, i) => (i === cp ? record : v)),
    visitDarts: 0,
  }
}

function effectiveDartScore(dart: Dart, bullValue: '25_50' | '50_50'): number {
  const { number, multiplier } = dart.segment
  if (multiplier === 0) return 0
  if (number === 25 && bullValue === '50_50') return 50
  return dart.score
}

// The bull counts as a double however it is reported (Board Manager and manual
// entry send number 50 with multiplier 1; its score is 50 either way).
const isDouble = (dart: Dart) => dart.segment.multiplier === 2 || dart.segment.number === 50

/** The dart may open (check-in) or finish (check-out) a player under the mode. */
function meetsMode(dart: Dart, mode: 'straight' | 'double' | 'master'): boolean {
  if (mode === 'straight') return true
  if (mode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

/** Nothing can finish from 1 unless any dart may finish. */
const deadEnd = (score: number, outMode: 'straight' | 'double' | 'master') => score === 1 && outMode !== 'straight'

// A session started before botSpeed existed has no such key in its stored config at all (its
// startPlan-merged defaults predate the field, and rebuildOne doesn't re-merge current defaults
// on restore) — defaulted here, at read time, rather than needing a migration. `X01Config` says
// it's always present, which is true for everything *written* from now on, but not for what may
// already be sitting in the database; the cast reflects that gap honestly instead of asserting
// past it.
function readBotSpeed(cfg: X01Config): X01Config['botSpeed'] {
  const maybePartial: Partial<X01Config> = cfg
  return maybePartial.botSpeed ?? 'normal'
}

// The open turn's position in `order`. A state that only names `currentPlayer` (in
// singles every seat appears once in `order`) falls back to that seat's position.
function position(s: X01State): number {
  return s.order[s.turn] === s.currentPlayer ? s.turn : s.order.indexOf(s.currentPlayer)
}

// Next turn in `order`; a new round starts when it gets back to the leg's start.
function nextTurn(s: X01State): { nextPlayer: number; turn: number; round: number } {
  const turn = (position(s) + 1) % s.order.length
  return { nextPlayer: s.order[turn], turn, round: turn === legStart(s.order, s.legs) ? s.round + 1 : s.round }
}

// Who throws after the open visit: the next turn, or after a checkout the next leg's
// starter; null when the visit ends the game (the last leg, the round limit) or it is over.
function upNext(s: X01State): number | null {
  if (s.phase === 'finished') return null
  const t = s.teamOf[s.currentPlayer]
  if (s.scores[t] === 0) {
    const legs = s.legs.map((l, i) => (i === t ? l + 1 : l))
    return legs[t] >= s.cfg.firstTo ? null : s.order[legStart(s.order, legs)]
  }
  const { nextPlayer, round } = nextTurn(s)
  return round > s.cfg.maxRounds ? null : nextPlayer
}

// The start moves on every leg, whoever won the last one: leg 1 starts at the first
// position in throw order, leg 2 at the second, and so on, wrapping around. With teams
// taking turns in `order`, the starting team alternates.
function legStart(order: number[], legs: number[]): number {
  const played = legs.reduce((a, b) => a + b, 0)
  return played % order.length
}

function freshLeg(s: X01State, legs: number[]): Partial<X01State> {
  const teams = teamCount(s.teamOf)
  const turn = legStart(s.order, legs)
  return {
    scores: Array<number>(teams).fill(s.cfg.startScore),
    opened: Array<boolean>(teams).fill(s.cfg.inMode === 'straight'),
    bustThisVisit: false,
    visitOpenedScores: Array<number>(teams).fill(s.cfg.startScore),
    turn,
    currentPlayer: s.order[turn],
    round: 1,
    legVisits: [],
  }
}

// The round limit: the lowest score wins, the lower team index on a tie.
function roundLimitWinner(scores: number[]): number {
  return scores.indexOf(Math.min(...scores))
}

const TEAM_IDS = ['A', 'B'] as const

// Teams are Team A (index 0) and Team B (index 1)
function validateTeams(cfg: X01Config, players: Player[]): string | null {
  if (cfg.format !== 'teams') return null
  const teams = cfg.teams
  const ok =
    teams !== undefined && teams.length === players.length && teams.every(t => t === 0 || t === 1) && teams.includes(0) && teams.includes(1)
  return ok ? null : 'teams need one entry per player, and both teams a player'
}

// `teams` and `teamStart` are set by the lobby, not the setup form
export const configMeta: Record<Exclude<keyof X01Config, 'teams' | 'teamStart'>, ConfigFieldMeta> = {
  format: {
    label: 'Format',
    tooltip: 'Teams: Team A against Team B, each sharing one score. Players take turns across the teams.',
    options: [
      { value: 'singles', label: 'Singles' },
      { value: 'teams', label: 'Teams' },
    ],
  },
  startScore: {
    label: 'Start score',
    options: [
      { value: 301, label: '301' },
      { value: 501, label: '501' },
      { value: 701, label: '701' },
    ],
  },
  inMode: {
    label: 'Check-in',
    tooltip: 'How a player starts scoring. Straight: any dart. Double/Master: must hit a double or master first.',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'double', label: 'Double' },
      { value: 'master', label: 'Master' },
    ],
  },
  outMode: {
    label: 'Check-out',
    tooltip: 'How a player finishes. Straight: any dart on 0. Double: must finish on a double. Master: double or triple.',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'double', label: 'Double' },
      { value: 'master', label: 'Master' },
    ],
  },
  bullOff: {
    label: 'Bull off',
    tooltip: 'Who throws first. Off: player 1 starts. WDC/PDC: one dart each, closest to bull goes first.',
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
  bullValue: {
    label: 'Bull value',
    tooltip: 'Score of the outer bull (25). 50/50: both bulls score 50 points.',
    options: [
      { value: '25_50', label: '25 / 50' },
      { value: '50_50', label: '50 / 50' },
    ],
  },
  maxRounds: {
    label: 'Max rounds',
    tooltip: 'Maximum rounds before the lowest score wins.',
  },
  firstTo: {
    label: 'First to',
    tooltip: 'Number of legs needed to win the match.',
  },
}

/** X01 without a bull off; `x01Module` below adds it. */
export const x01Game: GameModule<X01State, X01Config, X01View, 'x01', X01Detail> = {
  id: 'x01',
  version: 1,
  defaultConfig: {
    startScore: 501,
    inMode: 'straight',
    outMode: 'double',
    bullOff: 'off',
    botSpeed: 'normal',
    bullValue: '25_50',
    maxRounds: 50,
    firstTo: 3,
    format: 'singles',
  },
  configMeta,
  teams: true,

  validate: validateTeams,

  init(cfg: X01Config, players: Player[], rng?: Rng): X01State {
    const n = players.length
    const teamOf = teamOfSeats(cfg, n)
    const teams = teamCount(teamOf)
    const startTeam = cfg.format === 'teams' && cfg.teamStart === 'random' && rng ? (rng() < 0.5 ? 0 : 1) : 0
    // In singles: [0 … n-1]
    const order = turnOrder(teamOf, startTeam)
    return {
      cfg,
      phase: 'game',
      teamOf,
      scores: Array<number>(teams).fill(cfg.startScore),
      legs: Array<number>(teams).fill(0),
      opened: Array<boolean>(teams).fill(cfg.inMode === 'straight'),
      order,
      turn: 0,
      currentPlayer: order[0],
      round: 1,
      bustThisVisit: false,
      visitOpenedScores: Array<number>(teams).fill(cfg.startScore),
      winner: null,
      playerCount: n,
      pointsScored: Array<number>(n).fill(0),
      bestCheckout: Array<number>(n).fill(0),
      visitDarts: 0,
      legVisits: [],
      lastVisit: Array<X01VisitRecord | null>(n).fill(null),
      dartsThrown: Array<number>(n).fill(0),
      checkoutAttempts: Array<number>(n).fill(0),
      checkoutHits: Array<number>(n).fill(0),
    }
  },

  getCurrentPlayer(s: X01State): number {
    return s.currentPlayer
  },

  teamsOf(s: X01State): number[] {
    return s.teamOf
  },

  onBoardEvent(s: X01State, e: BoardEvent): { state: X01State } {
    switch (e.kind) {
      case 'visit.opened': {
        return { state: { ...s, bustThisVisit: false, visitOpenedScores: [...s.scores], visitDarts: 0 } }
      }

      case 'dart.detected': {
        const dart = e.data.dart
        // The thrower's team: its score counts down
        const t = s.teamOf[s.currentPlayer]

        if (s.scores[t] === 0) return { state: s }

        const thrown = { ...s, visitDarts: s.visitDarts + 1 }
        // Darts after a bust score nothing but were thrown (a correction can bust an earlier dart)
        if (s.bustThisVisit) return { state: thrown }

        if (!s.opened[t]) {
          const opens = meetsMode(dart, s.cfg.inMode)
          if (!opens) return { state: thrown }
          const opened = s.opened.map((o, i) => (i === t ? true : o))
          const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
          const newScore = s.scores[t] - dartScore
          if (newScore < 0 || deadEnd(newScore, s.cfg.outMode) || (newScore === 0 && !meetsMode(dart, s.cfg.outMode))) {
            return {
              state: { ...thrown, opened, bustThisVisit: true, scores: s.scores.map((sc, i) => (i === t ? s.visitOpenedScores[t] : sc)) },
            }
          }
          return { state: { ...thrown, opened, scores: s.scores.map((sc, i) => (i === t ? newScore : sc)) } }
        }

        const cp = s.currentPlayer
        // A dart thrown on a one-dart finish is a dart at the double, wherever it lands (see #119 for 25)
        const attempt = checkoutHint(s.scores[t], s.cfg.outMode, 1) !== null
        const counted = attempt ? { ...thrown, checkoutAttempts: s.checkoutAttempts.map((a, i) => (i === cp ? a + 1 : a)) } : thrown

        const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
        const newScore = s.scores[t] - dartScore

        if (newScore < 0 || deadEnd(newScore, s.cfg.outMode) || (newScore === 0 && !meetsMode(dart, s.cfg.outMode))) {
          return { state: { ...counted, scores: s.scores.map((sc, i) => (i === t ? s.visitOpenedScores[t] : sc)), bustThisVisit: true } }
        }

        const scores = s.scores.map((sc, i) => (i === t ? newScore : sc))
        if (newScore === 0) {
          return { state: { ...counted, scores, checkoutHits: s.checkoutHits.map((h, i) => (i === cp ? h + 1 : h)) } }
        }
        return { state: { ...counted, scores } }
      }

      case 'takeout.finished': {
        const cp = s.currentPlayer
        const t = s.teamOf[cp]
        const done = committedVisit(s)

        // Leg win, for the thrower's team; the checkout counts for the thrower
        if (s.scores[t] === 0) {
          const legs = s.legs.map((l, i) => (i === t ? l + 1 : l))
          const bestCheckout = s.bestCheckout.map((b, i) => (i === cp ? Math.max(b, s.visitOpenedScores[t]) : b))
          if (legs[t] >= s.cfg.firstTo) {
            return { state: { ...s, ...done, legs, winner: t, phase: 'finished', bestCheckout } }
          }
          return { state: { ...s, ...done, legs, bestCheckout, ...freshLeg(s, legs) } }
        }

        const { nextPlayer, turn, round } = nextTurn(s)

        if (round > s.cfg.maxRounds) {
          return {
            state: { ...s, ...done, currentPlayer: nextPlayer, turn, round, winner: roundLimitWinner(s.scores), phase: 'finished' },
          }
        }

        return {
          state: { ...s, ...done, currentPlayer: nextPlayer, turn, round, bustThisVisit: false, visitOpenedScores: [...s.scores] },
        }
      }

      case 'visit.cleared': {
        const done = committedVisit(s)
        const { nextPlayer, turn, round } = nextTurn(s)

        if (round > s.cfg.maxRounds) {
          return {
            state: { ...s, ...done, currentPlayer: nextPlayer, turn, round, winner: roundLimitWinner(s.scores), phase: 'finished' },
          }
        }

        return {
          state: { ...s, ...done, currentPlayer: nextPlayer, turn, round, bustThisVisit: false, visitOpenedScores: [...s.scores] },
        }
      }

      default:
        return { state: s }
    }
  },

  onUserAction(s: X01State): { state: X01State } {
    return { state: s }
  },

  // Per seat: each seat shows its team's score, legs and opened. The winner is a seat
  // (in a team game the winning team's first seat; `teams` has the team results).
  view(s: X01State): X01View {
    const view: X01View = {
      scores: s.teamOf.map(t => s.scores[t]),
      legs: s.teamOf.map(t => s.legs[t]),
      firstTo: s.cfg.firstTo,
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s),
      round: s.round,
      phase: s.phase,
      winner: s.winner === null ? null : s.teamOf.indexOf(s.winner),
      opened: s.teamOf.map(t => s.opened[t]),
      bustThisVisit: s.bustThisVisit,
      config: { outMode: s.cfg.outMode, startScore: s.cfg.startScore, inMode: s.cfg.inMode, botSpeed: readBotSpeed(s.cfg) },
      visitLocked: s.bustThisVisit || s.scores[s.teamOf[s.currentPlayer]] === 0,
      pointsScored: s.pointsScored,
      dartsThrown: s.dartsThrown,
      legVisits: s.legVisits,
      lastVisit: s.lastVisit,
      checkoutAttempts: s.checkoutAttempts,
      checkoutHits: s.checkoutHits,
      visitStartScores: s.teamOf.map(t => s.visitOpenedScores[t]),
    }
    if (s.cfg.format !== 'teams') return view
    const teams = seatsByTeam(s.teamOf).map((seats, t) => ({
      id: TEAM_IDS[t],
      name: `Team ${TEAM_IDS[t]}`,
      seats,
      score: s.scores[t],
      legs: s.legs[t],
    }))
    return { ...view, teams }
  },

  // Reads state directly rather than going through view(): botTarget's signature has no
  // `players` argument (it's never needed here — only scores/config/opened are), and the raw
  // state is simpler and more direct than reconstructing the same values from the view's
  // per-seat arrays. A bull off is not X01's concern — the scheduler aims at the bull itself
  // without ever calling this (see backend/src/bots/scheduler.ts).
  botTarget(s: X01State, seatIndex: number, dartsThrown: number): Point | 'takeout' | null {
    const t = s.teamOf[seatIndex]
    const visitOver = s.bustThisVisit || s.scores[t] === 0 || dartsThrown >= 3 || s.winner !== null
    if (visitOver) return 'takeout'
    return pickTarget(s.scores[t] ?? 0, 3 - dartsThrown, s.cfg.outMode, { opened: s.opened[t] ?? true, inMode: s.cfg.inMode })
  },

  getLeg(s: X01State): number {
    return s.legs.reduce((a, b) => a + b, 0)
  },

  // Every seat once, in the order they first throw (`order` repeats seats for uneven teams)
  throwOrder(s: X01State): number[] {
    return [...new Set(s.order)]
  },

  // Teams are ranked (in singles every seat is a team); every seat shares its team's place
  summarize(s: X01State, { totalDarts }): SeatResult[] {
    // One entry per seat
    const teamOf = Array.from({ length: s.playerCount }, (_, seat) => s.teamOf[seat])
    const teamPlaces = rankSeats(teamCount(teamOf), s.winner, (a, b) => s.legs[b] - s.legs[a] || s.scores[a] - s.scores[b])
    return seatPlacements(teamOf, teamPlaces).map((placement, i) => {
      const darts = totalDarts[i] ?? 0
      return {
        placement,
        stats: {
          average: darts > 0 ? (s.pointsScored[i] / darts) * 3 : 0,
          dartsThrown: darts,
          legsWon: s.legs[s.teamOf[i]],
          pointsScored: s.pointsScored[i],
          // Only for players who checked out a leg, so min/avg over games stay meaningful
          ...(s.bestCheckout[i] > 0 && { bestCheckout: s.bestCheckout[i] }),
        },
      }
    })
  },

  detail(visits, final): X01Detail {
    const legs: X01Detail['legs'] = []
    for (const v of visits) {
      if (v.phase !== 'game') continue
      let leg = legs.find(l => l.leg === v.leg)
      if (!leg) {
        leg = { leg: v.leg, starter: v.seat, winner: null, visits: [] }
        legs.push(leg)
      }
      // Scores and legs are the thrower's team's
      const t = v.start.teamOf[v.seat]
      const bust = v.end.bustThisVisit
      const remaining = v.end.scores[t]
      if (v.after.legs[t] > v.start.legs[t]) leg.winner = v.seat
      leg.visits.push({
        visit: v.visit,
        seat: v.seat,
        committedAt: v.committedAt,
        darts: v.darts,
        scored: bust ? 0 : v.start.scores[t] - remaining,
        remaining,
        bust,
      })
    }
    if (final.cfg.format !== 'teams') return { mode: 'x01', legs }
    const teams = seatsByTeam(final.teamOf).map((seats, t) => ({ id: TEAM_IDS[t], name: `Team ${TEAM_IDS[t]}`, seats }))
    return { mode: 'x01', teams, legs }
  },

  matchStats: x01MatchStats,
}

/** X01 with an optional bull off deciding the throwing order. */
// In a team game the bull off winner throws first and the teams take turns
const withBullOffX01 = withBullOff(x01Game, {
  applyStartOrder: (s, bullOffOrder) => {
    const winner = bullOffOrder[0]
    const order = s.cfg.format === 'teams' ? turnOrder(s.teamOf, s.teamOf[winner], winner) : bullOffOrder
    return { ...s, order, turn: 0, currentPlayer: order[0] }
  },
})

// During the bull off nobody is up next in the game yet
export const x01Module: typeof withBullOffX01 = {
  ...withBullOffX01,
  view(s, players) {
    const v = withBullOffX01.view(s, players)
    return s.stage === 'bulloff' ? { ...v, nextPlayer: null } : v
  },
}
