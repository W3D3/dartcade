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

// Aliases for shorter names throughout the backend
export type Dart = ADetectedDart
export type Segment = BoardManagerSegment
export type { DartDetectedData, DartCorrectedData, TakeoutFinishedData, VisitOpenedData, VisitClearedData, BoardResyncData, BoardStatusData }

export type Player = { name: string }

export type Effect = { type: 'board.reset' }

export type UserAction =
  | { type: 'correct_dart'; visitIndex: number; segment: Segment }
  | { type: 'undo_dart' }
  | { type: 'takeout' }

export type BoardEvent =
  | { kind: 'visit.opened';     data: VisitOpenedData }
  | { kind: 'dart.detected';    data: DartDetectedData }
  | { kind: 'dart.corrected';   data: DartCorrectedData }
  | { kind: 'takeout.finished'; data: TakeoutFinishedData }
  | { kind: 'visit.cleared';    data: VisitClearedData }
  | { kind: 'board.resync';     data: BoardResyncData }
  | { kind: 'board.status';     data: BoardStatusData }
  | { kind: string;             data: unknown }

export type ConfigFieldMeta = {
  label: string
  tooltip?: string
  options?: { value: string | number | boolean; label: string }[]
}

export interface GameModule<S, Cfg = Record<string, never>> {
  id: string
  defaultConfig: Cfg
  configMeta?: Record<string, ConfigFieldMeta>
  init(cfg: Cfg, players: Player[]): S
  getCurrentPlayer(s: S): number
  onBoardEvent(s: S, e: BoardEvent): { state: S; effects?: Effect[] }
  onUserAction(s: S, a: UserAction): { state: S; effects?: Effect[] }
  view(s: S, players: Player[]): Record<string, unknown>
}

export interface Session<S = unknown> {
  id: string
  boardId: string
  players: Player[]
  module: GameModule<S, unknown>
  committedState: S
  openVisitEvents: BoardEvent[]
  currentState: S
  status: 'active' | 'finished'
  createdAt: Date
  totalDarts: number[]
  totalVisits: number[]
  bmStatus: { status: string; running: boolean; event: string } | null
}

export type Snapshot = {
  type: 'snapshot'
  sessionId: string
  gameId: string
  players: Player[]
  game: Record<string, unknown>
  bmStatus: { status: string; running: boolean; event: string } | null
}
