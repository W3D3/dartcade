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
import type { components } from '../schema/api.js'

// Aliases for shorter names throughout the backend
export type Dart = ADetectedDart
export type Segment = BoardManagerSegment
export type {
  DartDetectedData,
  DartCorrectedData,
  TakeoutFinishedData,
  VisitOpenedData,
  VisitClearedData,
  BoardResyncData,
  BoardStatusData,
}

export type Player = { name: string }

/** A seat: the player, who may act for them, and where their darts come from (null = by hand). */
export type Seat = { name: string; userId: string | null; controllerUserId: string; boardId: string | null; boardName: string | null }

export type BmStatus = { status: string; running: boolean; event: string }

export type Effect = { type: 'board.reset' }

export type { Snapshot } from '../schema/game-ws.js'
export type { UserAction }

/**
 * A board event as the games see it, discriminated by `kind`. The dart events carry
 * their (validated, see parseBoardEvent) data; the other kinds only mark a point in the
 * visit and their data is kept as received, unread.
 */
export type BoardEvent =
  | { kind: 'dart.detected'; data: DartDetectedData }
  | { kind: 'dart.corrected'; data: DartCorrectedData }
  | { kind: 'visit.opened'; data: unknown }
  | { kind: 'takeout.finished'; data: unknown }
  | { kind: 'visit.cleared'; data: unknown }
  | { kind: 'board.resync'; data: unknown }
  | { kind: 'board.status'; data: unknown }

export type ConfigFieldMeta = {
  label: string
  tooltip?: string
  options?: { value: string | number | boolean; label: string }[]
}

/** A dart of a committed visit, as the history keeps it. */
export type HistoryDart = components['schemas']['HistoryDart']
export type DartSource = HistoryDart['source']

/** What the engine knows about a dart of the open visit (in dart order). */
/** A committed visit as Undo restores it: the state before it, and its open darts. */
export type UndoableVisit = { committedState: unknown; openVisitEvents: BoardEvent[]; openDarts: DartMeta[]; seat: number }

export type DartMeta = { source: DartSource; corrected: boolean; thrownAt: Date }
export type X01Detail = components['schemas']['X01Detail']
export type AtcDetail = components['schemas']['AtcDetail']
export type VisitPhase = 'game' | 'bulloff'

/** A visit as it was committed, with the game state around it (see applyInput). */
export interface CommittedVisit<S> {
  /** Per-session visit number, from 0. */
  visit: number
  seat: number
  leg: number
  phase: VisitPhase
  committedAt: string
  darts: HistoryDart[]
  /** State after the visit's visit.opened. */
  start: S
  /** State after its last dart, before it was committed. */
  end: S
  /** State once committed. */
  after: S
}

/** One seat's result once a game is won. */
export type SeatResult = { placement: number; stats: Record<string, number> }

/** A seat's result as stored: the module's result plus where the seat threw in the game (0 = first). */
export type FinishedSeat = SeatResult & { throwPosition: number; forfeited: boolean }

/** Counts the engine keeps per seat (bull off excluded). */
export type SummaryContext = { totalDarts: number[]; totalVisits: number[] }

/**
 * A game. `V` is what view() returns, `Id` the game's id (a literal for registered
 * games, so a session's module tells which snapshot shape it produces), `D` what
 * detail() returns.
 */
export interface GameModule<
  S,
  Cfg = Record<string, never>,
  V extends object = Record<string, unknown>,
  Id extends string = string,
  D = unknown,
> {
  id: Id
  /** Bumped when a rule change would replay old games' logs differently. */
  version: number
  defaultConfig: Cfg
  configMeta?: Record<string, ConfigFieldMeta>
  /** Can be played in teams: its config takes `format` and `teams` (see games/teams.ts). */
  teams?: true
  /** The team index of every seat (a game with `teams`; in singles the seat itself). */
  teamsOf?(s: S): number[]
  /** Reject a config that can't be played with these players; returns the reason. */
  validate?(cfg: Cfg, players: Player[]): string | null
  /** `rng` drives any random setup; the engine passes one seeded per game. */
  init(cfg: Cfg, players: Player[], rng?: Rng): S
  getCurrentPlayer(s: S): number
  onBoardEvent(s: S, e: BoardEvent): { state: S; effects?: Effect[] }
  onUserAction(s: S, a: UserAction): { state: S; effects?: Effect[] }
  view(s: S, players: Player[]): V
  /** The leg the current visit belongs to (0-based); single-leg games leave it out. */
  getLeg?(s: S): number
  /** The result once the game is won: one entry per seat, in seat order. */
  summarize(s: S, ctx: SummaryContext): SeatResult[]
  /** Seats in the order they threw (e.g. as a bull off decided); seat order when left out. */
  throwOrder?(s: S): number[]
  /** The game's detail for GET /api/games/:id, built from its replayed visits. */
  detail(visits: CommittedVisit<S>[], final: S): D
}

/** A registered game with its state type erased; `id` tells which view (and snapshot) it produces. */
export type AnyGameModule =
  | GameModule<unknown, GameConfig, X01ModuleView, 'x01', X01Detail>
  | GameModule<unknown, GameConfig, AtcView, 'atc', AtcDetail>

/** A game's config as the API and the database carry it (a JSON object). */
export type GameConfig = Record<string, unknown>

export interface Session {
  id: string
  /** The host: started the game; may start the bull off and abort. */
  ownerUserId: string
  /** The local game's board (null for lobby games: see seats). */
  boardId: string | null
  /** The lobby the game was started from; null for a local game. */
  lobbyId: string | null
  /** The lobby's name at the start, for the match header; null for a local game. */
  lobbyName: string | null
  seats: Seat[]
  players: Player[]
  module: AnyGameModule
  committedState: unknown
  openVisitEvents: BoardEvent[]
  /** One entry per dart.detected in openVisitEvents, same order. */
  openDarts: DartMeta[]
  currentState: unknown
  status: 'active' | 'finished' | 'aborted'
  createdAt: Date
  /** Seed of the generator passed to init(); stored so a replay sets the game up the same way. */
  seed: number
  /** Visits committed so far; numbers the next one. */
  visitCount: number
  /** seq of the next input log entry. */
  nextSeq: number
  totalDarts: number[]
  totalVisits: number[]
  /** Seat indices that have forfeited, ascending. */
  forfeited: number[]
  /** The game's committed visits since the bull off, newest last, as they were before each was
   *  committed: Undo with no darts open puts the last one back (see applyInput). */
  undoable: UndoableVisit[]
  /** Latest board.status per board id. */
  boardStatus: Map<string, BmStatus>
}
