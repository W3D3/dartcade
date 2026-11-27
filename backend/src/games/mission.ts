// Missions: one mission played by one or more players taking turns (backend/src/shared/missions/, the
// rules; this file adapts them to the engine). Every player has their own run through the steps; the
// mission is shared, a snapshot taken at the start, so an edit never changes a running game. Each
// player's clock is the server's time of each input (onClock) and runs only during their turn.
// A player who fails, gives up or runs out of time is out; the game ends when nobody is left playing.
// Design: docs/superpowers/specs/2026-11-24-missions-design.md.
import type { BoardEvent, CommittedVisit, Dart, GameModule, MissionDetail, Player, SeatResult, UserAction } from '../session/types.js'
import type { MissionView } from '../session/views.js'
import { progressOf } from '../shared/missions/steps.js'
import {
  deadline,
  endTurn,
  endVisit,
  giveUp,
  type MissionRun,
  pause,
  resume,
  startRun,
  startTurn,
  stepsDone,
  switchStep,
  throwDart,
  tick,
} from '../shared/missions/run.js'
import { MissionSchema, type Mission, type MissionDart } from '../shared/missions/types.js'
import { OFFICIAL_MISSIONS } from '../shared/missions/official.js'
import type { RunResult } from '../shared/missions/highscores.js'
import { rankSeats } from './ranking.js'
import { nextTurn } from './turns.js'

/** A player's best completed run, as the play screen lists them. */
export type MissionHighscore = { userId: string | null; name: string; timeMs: number; darts: number }

export type MissionConfig = {
  missionId: string
  /** The author tries their own mission: it counts for no times, XP, stats or history. */
  test: boolean
  mission: Mission
  /** The mission's best results when the game started. */
  highscores: MissionHighscore[]
  /**
   * Each account's own best when the game started (null: none yet), by user id: the result screen's
   * "new personal best" (the highscores hold only the top 10).
   */
  bests: Record<string, RunResult | null>
}

export type MissionState = {
  cfg: MissionConfig
  /** Each seat's own run through the steps. */
  runs: MissionRun[]
  order: number[]
  turn: number
  currentPlayer: number
  /** The latest input's time (ms since the epoch): when a takeout hands the turn on. */
  now: number | null
}

const toMissionDart = (d: Dart): MissionDart => ({ number: d.segment.number, multiplier: d.segment.multiplier, score: d.score })

const playing = (run: MissionRun) => run.status === 'playing'
const finished = (s: MissionState) => !s.runs.some(playing)

// The seat up plays `run` now
const withRun = (s: MissionState, run: MissionRun): MissionState =>
  run === s.runs[s.currentPlayer] ? s : { ...s, runs: s.runs.map((r, i) => (i === s.currentPlayer ? run : r)) }

// The turn passes to the next seat still playing, at the time of the takeout that ended it
function advance(s: MissionState): MissionState {
  const next = nextTurn(s.order, s.turn, seat => playing(s.runs[seat]))
  const at = s.now
  if (!next || next.seat === s.currentPlayer || at === null) return next ? { ...s, turn: next.turn } : s
  const runs = s.runs.map((r, i) => (i === s.currentPlayer ? endTurn(r, at) : i === next.seat ? startTurn(r, at) : r))
  return { ...s, runs, turn: next.turn, currentPlayer: next.seat }
}

/** Negative when seat `a` ranks ahead of `b`: more steps done, then (both completed) the faster time. */
function compareSeats(s: MissionState, a: number, b: number): number {
  const [ra, rb] = [s.runs[a], s.runs[b]]
  const both = ra.status === 'completed' && rb.status === 'completed'
  return stepsDone(rb) - stepsDone(ra) || (both ? (ra.timeMs ?? 0) - (rb.timeMs ?? 0) : 0)
}

const placementsOf = (s: MissionState) => rankSeats(s.runs.length, null, (a, b) => compareSeats(s, a, b))

const first = OFFICIAL_MISSIONS[0]

export const missionModule: GameModule<MissionState, MissionConfig, MissionView, 'mission', MissionDetail> = {
  id: 'mission',
  version: 1,
  // The deciding dart stops the clock; the board's takeout ends the game without a Finish button
  noFinishHold: true,
  defaultConfig: { missionId: first.id, test: false, mission: first.mission, highscores: [], bests: {} },

  validate(cfg: MissionConfig, players: Player[]): string | null {
    if (players.length < 1) return 'At least 1 player'
    if (cfg.test && players.length !== 1) return 'A test run is played alone'
    if (typeof cfg.missionId !== 'string' || cfg.missionId === '') return 'No mission'
    if (typeof cfg.test !== 'boolean' || !Array.isArray(cfg.highscores) || typeof cfg.bests !== 'object') return 'Invalid mission config'
    return MissionSchema.safeParse(cfg.mission).success ? null : 'Invalid mission'
  },

  init: (cfg: MissionConfig, players: Player[]): MissionState => ({
    cfg,
    runs: players.map(() => startRun(cfg.mission)),
    order: players.map((_, i) => i),
    turn: 0,
    currentPlayer: 0,
    now: null,
  }),

  getCurrentPlayer: (s: MissionState) => s.currentPlayer,

  // The open visit's deciding dart stopped the player's clock: only the turn's time moves on. A dart
  // folded again (a correction) is timed when it was thrown: the turn's time never goes back
  onClock: (s: MissionState, now: number, current: MissionState): MissionState => {
    const turnTime = Math.max(s.now ?? now, now)
    return playing(current.runs[current.currentPlayer])
      ? { ...withRun(s, tick(s.cfg.mission, s.runs[s.currentPlayer], now)), now: turnTime }
      : { ...s, now: turnTime }
  },

  onBoardEvent(s: MissionState, e: BoardEvent): { state: MissionState } {
    if (finished(s)) return { state: s }
    const run = s.runs[s.currentPlayer]
    switch (e.kind) {
      case 'dart.detected':
        return { state: withRun(s, throwDart(s.cfg.mission, run, toMissionDart(e.data.dart))) }
      case 'takeout.finished':
      case 'visit.cleared':
        return { state: advance(withRun(s, endVisit(s.cfg.mission, run))) }
      default:
        return { state: s }
    }
  },

  onUserAction(s: MissionState, a: UserAction): { state: MissionState } {
    if (finished(s)) return { state: s }
    const { mission } = s.cfg
    const run = s.runs[s.currentPlayer]
    switch (a.type) {
      case 'mission_switch':
        return { state: withRun(s, switchStep(mission, run, a.step)) }
      case 'mission_pause':
        return { state: withRun(s, pause(mission, run)) }
      case 'mission_resume':
        return { state: withRun(s, resume(run)) }
      // Only the player up leaves; the others play on
      case 'mission_give_up':
        return { state: advance(withRun(s, giveUp(run))) }
      // The engine has read the time (onClock): a player whose time ran out hands the turn on
      case 'mission_clock':
        return { state: playing(run) ? s : advance(s) }
      default:
        return { state: s }
    }
  },

  view(s: MissionState): MissionView {
    const { mission } = s.cfg
    const over = finished(s)
    const placements = placementsOf(s)
    const up = s.runs[s.currentPlayer]
    const next = over ? null : advance(withRun(s, endVisit(mission, up)))
    return {
      missionId: s.cfg.missionId,
      test: s.cfg.test,
      mission,
      highscores: s.cfg.highscores,
      bests: s.cfg.bests,
      runs: s.runs.map((run, i) => ({
        status: run.status,
        failure: run.failure,
        active: run.active,
        steps: run.steps.map((step, j) => ({
          attempts: step.attempts,
          best: step.best,
          darts: step.darts,
          doneAt: step.doneAt,
          progress: progressOf(mission.steps[j], step.attempt),
        })),
        restarts: run.restarts,
        darts: run.darts,
        clock: { ...run.clock, deadline: i === s.currentPlayer ? deadline(mission, run) : null },
        timeMs: run.timeMs,
        place: over ? placements[i] : null,
      })),
      chips: up.visit.chips,
      currentPlayer: s.currentPlayer,
      nextPlayer: next && !finished(next) ? next.currentPlayer : null,
      winner: over ? placements.indexOf(1) : null,
      visitLocked: over || up.visit.locked || up.clock.pausedAt !== null || !playing(up),
    }
  },

  throwOrder: (s: MissionState) => [...s.order],

  summarize: (s: MissionState): SeatResult[] => {
    const placements = placementsOf(s)
    return s.runs.map((run, i) => ({
      placement: placements[i],
      stats: {
        completed: run.status === 'completed' ? 1 : 0,
        stepsDone: stepsDone(run),
        steps: run.steps.length,
        timeMs: run.timeMs ?? 0,
        darts: run.darts,
      },
    }))
  },

  detail(_visits: CommittedVisit<MissionState>[], final: MissionState): MissionDetail {
    const placements = placementsOf(final)
    return {
      mode: 'mission',
      missionId: final.cfg.missionId,
      test: final.cfg.test,
      mission: final.cfg.mission,
      seats: final.runs.map((run, i) => ({
        place: placements[i],
        status: run.status,
        failure: run.failure,
        timeMs: run.timeMs,
        darts: run.darts,
        restarts: run.restarts,
        steps: run.steps.map(step => ({ attempts: step.attempts, best: step.best, darts: step.darts, doneAt: step.doneAt })),
      })),
    }
  },
}
