import type {
  ADetectedDart,
  BoardManagerSegment,
  DartDetectedData,
  DartCorrectedData,
  TakeoutFinishedData,
  VisitOpenedData,
  VisitClearedData,
  BoardResyncData,
  BoardStatusData,
} from '../schema/types.js'
import type { UserAction } from '../schema/game-ws.js'
import type { AtcView, X01ModuleView } from './views.js'
import type { Rng } from './rng.js'

// Aliases for shorter names throughout the backend
export type Dart = ADetectedDart
export type Segment = BoardManagerSegment
export type { DartDetectedData, DartCorrectedData, TakeoutFinishedData, VisitOpenedData, VisitClearedData, BoardResyncData, BoardStatusData }

export type Player = { name: string }

export type Effect = { type: 'board.reset' }

export type { Snapshot } from '../schema/game-ws.js'
export type { UserAction }

/**
 * A board event as the games see it, discriminated by `kind`. The dart events carry
 * their (validated, see parseBoardEvent) data; the other kinds only mark a point in the
 * visit and their data is kept as received, unread.
 */
export type BoardEvent =
  | { kind: 'dart.detected';    data: DartDetectedData }
  | { kind: 'dart.corrected';   data: DartCorrectedData }
  | { kind: 'visit.opened';     data: unknown }
  | { kind: 'takeout.finished'; data: unknown }
  | { kind: 'visit.cleared';    data: unknown }
  | { kind: 'board.resync';     data: unknown }
  | { kind: 'board.status';     data: unknown }

export type ConfigFieldMeta = {
  label: string
  tooltip?: string
  options?: { value: string | number | boolean; label: string }[]
}

/**
 * A game. `V` is what view() returns, `Id` the game's id (a literal for registered
 * games, so a session's module tells which snapshot shape it produces).
 */
export interface GameModule<S, Cfg = Record<string, never>, V extends object = Record<string, unknown>, Id extends string = string> {
  id: Id
  defaultConfig: Cfg
  configMeta?: Record<string, ConfigFieldMeta>
  /** Reject a config that can't be played with these players; returns the reason. */
  validate?(cfg: Cfg, players: Player[]): string | null
  /** `rng` drives any random setup; the engine passes one seeded per game. */
  init(cfg: Cfg, players: Player[], rng?: Rng): S
  getCurrentPlayer(s: S): number
  onBoardEvent(s: S, e: BoardEvent): { state: S; effects?: Effect[] }
  onUserAction(s: S, a: UserAction): { state: S; effects?: Effect[] }
  view(s: S, players: Player[]): V
}

/** A registered game with its state type erased; `id` tells which view (and snapshot) it produces. */
export type AnyGameModule =
  | GameModule<unknown, GameConfig, X01ModuleView, 'x01'>
  | GameModule<unknown, GameConfig, AtcView, 'atc'>

/** A game's config as the API and the database carry it (a JSON object). */
export type GameConfig = Record<string, unknown>

export interface Session {
  id: string
  /** The user who started it; each user has at most one active session. */
  ownerUserId: string
  boardId: string | null
  players: Player[]
  module: AnyGameModule
  committedState: unknown
  openVisitEvents: BoardEvent[]
  currentState: unknown
  status: 'active' | 'finished'
  createdAt: Date
  /** Seed of the generator passed to init(); stored so a replay sets the game up the same way. */
  seed: number
  totalDarts: number[]
  totalVisits: number[]
  bmStatus: { status: string; running: boolean; event: string } | null
}
