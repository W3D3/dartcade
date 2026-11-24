// Missions: a solo game playing a mission's steps (backend/src/shared/missions/, the rules; this file
// adapts them to the engine). The config carries a snapshot of the mission taken at the start, so an
// edit never changes a running game. The clock is the server's time of each input (onClock).
// Design: docs/superpowers/specs/2026-11-24-missions-design.md.
import type { BoardEvent, CommittedVisit, Dart, GameModule, MissionDetail, Player, SeatResult, UserAction } from '../session/types.js'
import type { MissionView } from '../session/views.js'
import { progressOf } from '../shared/missions/steps.js'
import {
  deadline,
  endVisit,
  giveUp,
  type MissionRun,
  pause,
  resume,
  startRun,
  stepsDone,
  switchStep,
  throwDart,
  tick,
} from '../shared/missions/run.js'
import { MissionSchema, type Mission, type MissionDart } from '../shared/missions/types.js'
import { OFFICIAL_MISSIONS } from '../shared/missions/official.js'

/** A player's best completed run, as the play screen lists them. */
export type MissionHighscore = { userId: string | null; name: string; timeMs: number; darts: number }

export type MissionConfig = {
  missionId: string
  /** The author tries their own mission: it counts for no times, XP, stats or history. */
  test: boolean
  mission: Mission
  /** The mission's best results when the game started. */
  highscores: MissionHighscore[]
}

export type MissionState = { cfg: MissionConfig; run: MissionRun }

const toMissionDart = (d: Dart): MissionDart => ({ number: d.segment.number, multiplier: d.segment.multiplier, score: d.score })

const over = (s: MissionState) => s.run.status !== 'playing'

const withRun = (s: MissionState, run: MissionRun): MissionState => (run === s.run ? s : { ...s, run })

const first = OFFICIAL_MISSIONS[0]

export const missionModule: GameModule<MissionState, MissionConfig, MissionView, 'mission', MissionDetail> = {
  id: 'mission',
  version: 1,
  // The deciding dart stops the clock; the board's takeout ends the game without a Finish button
  noFinishHold: true,
  defaultConfig: { missionId: first.id, test: false, mission: first.mission, highscores: [] },

  validate(cfg: MissionConfig, players: Player[]): string | null {
    if (players.length !== 1) return 'A mission is played alone'
    if (typeof cfg.missionId !== 'string' || cfg.missionId === '') return 'No mission'
    if (typeof cfg.test !== 'boolean' || !Array.isArray(cfg.highscores)) return 'Invalid mission config'
    return MissionSchema.safeParse(cfg.mission).success ? null : 'Invalid mission'
  },

  init: (cfg: MissionConfig): MissionState => ({ cfg, run: startRun(cfg.mission) }),

  getCurrentPlayer: () => 0,

  onClock: (s: MissionState, now: number): MissionState => withRun(s, tick(s.cfg.mission, s.run, now)),

  onBoardEvent(s: MissionState, e: BoardEvent): { state: MissionState } {
    switch (e.kind) {
      case 'dart.detected':
        return { state: withRun(s, throwDart(s.cfg.mission, s.run, toMissionDart(e.data.dart))) }
      case 'takeout.finished':
      case 'visit.cleared':
        return { state: withRun(s, endVisit(s.cfg.mission, s.run)) }
      default:
        return { state: s }
    }
  },

  onUserAction(s: MissionState, a: UserAction): { state: MissionState } {
    switch (a.type) {
      case 'mission_switch':
        return { state: withRun(s, switchStep(s.cfg.mission, s.run, a.step)) }
      case 'mission_pause':
        return { state: withRun(s, pause(s.cfg.mission, s.run)) }
      case 'mission_resume':
        return { state: withRun(s, resume(s.run)) }
      case 'mission_give_up':
        return { state: withRun(s, giveUp(s.run)) }
      default:
        // mission_clock only makes the engine read the time (onClock)
        return { state: s }
    }
  },

  view(s: MissionState): MissionView {
    const { run, cfg } = s
    return {
      missionId: cfg.missionId,
      test: cfg.test,
      mission: cfg.mission,
      highscores: cfg.highscores,
      status: run.status,
      failure: run.failure,
      active: run.active,
      steps: run.steps.map((step, i) => ({
        attempts: step.attempts,
        best: step.best,
        darts: step.darts,
        doneAt: step.doneAt,
        progress: progressOf(cfg.mission.steps[i], step.attempt),
      })),
      restarts: run.restarts,
      darts: run.darts,
      chips: run.visit.chips,
      clock: { ...run.clock, deadline: deadline(cfg.mission, run) },
      timeMs: run.timeMs,
      currentPlayer: 0,
      winner: over(s) ? 0 : null,
      visitLocked: run.visit.locked || run.clock.pausedAt !== null || over(s),
    }
  },

  summarize: (s: MissionState): SeatResult[] => [
    {
      placement: 1,
      stats: {
        completed: s.run.status === 'completed' ? 1 : 0,
        stepsDone: stepsDone(s.run),
        steps: s.run.steps.length,
        timeMs: s.run.timeMs ?? 0,
        darts: s.run.darts,
      },
    },
  ],

  detail(_visits: CommittedVisit<MissionState>[], final: MissionState): MissionDetail {
    const { run, cfg } = final
    return {
      mode: 'mission',
      missionId: cfg.missionId,
      test: cfg.test,
      mission: cfg.mission,
      status: run.status,
      failure: run.failure,
      timeMs: run.timeMs,
      darts: run.darts,
      restarts: run.restarts,
      steps: run.steps.map(step => ({ attempts: step.attempts, best: step.best, darts: step.darts, doneAt: step.doneAt })),
    }
  },
}
