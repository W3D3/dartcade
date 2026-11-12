import type { components } from './schema'

type Schemas = components['schemas']
export type Board = Schemas['Board']
export type BoardStatus = Schemas['BoardStatus']
export type BoardEvent = Schemas['BoardEvent']
export type GameInfo = Schemas['GameInfo']
export type ConfigFieldMeta = Schemas['ConfigFieldMeta']
export type FriendSearchHit = Schemas['FriendSearchResult']
export type SessionSummary = Schemas['SessionSummary']
export type ErrorResponse = Schemas['ErrorResponse']
export type TournamentSummary = Schemas['TournamentSummary']
export type Tournament = Schemas['Tournament']
export type MyTournaments = Schemas['MyTournaments']
export type MyTournamentRef = Schemas['MyTournamentRef']
export type GameSummary = Schemas['GameSummary']
export type GameStats = Schemas['GameStats']
export type CoachLegRow = Schemas['CoachLegRow']
export type CoachLegCounts = Schemas['CoachLegCounts']
export type CoachLegPage = Schemas['CoachLegPage']
export type CoachLegTitle = Schemas['CoachLegTitle']
export type GameSeat = Schemas['GameSeat']
export type GameDetail = Schemas['GameDetail']
export type MatchStats = Schemas['MatchStats']
export type StatRow = Schemas['StatRow']
export type StatValues = Schemas['StatValues']
export type X01Stats = Schemas['X01Stats']
export type StatMetric = Schemas['StatMetric']
export type StatCount = Schemas['StatCount']
export type StatRef = Schemas['StatRef']
export type StatBest = Schemas['StatBest']
export type StatsRange = Schemas['StatsRange']
export type StatsKind = Schemas['StatsKind']
export type StatsOutMode = Schemas['StatsOutMode']
export type StatsSpan = Schemas['StatsSpan']
export type X01Detail = Schemas['X01Detail']
export type AtcDetail = Schemas['AtcDetail']
export type P121Detail = Schemas['P121Detail']
export type VoicePackSummary = Schemas['VoicePackSummary']
export type VoicePackImport = Schemas['VoicePackImport']
export type VoicePackList = Schemas['VoicePackList']
export type AdminUser = Schemas['AdminUser']
export type AdminUserActivity = Schemas['AdminUserActivity']
export type UserAuditEntry = Schemas['UserAuditEntry']
export type AdminGameSummary = Schemas['AdminGameSummary']
export type QueuedSearch = Schemas['RankedQueueList']['searches'][number]
export type AdminFlag = Schemas['AdminFlag']
export type AdminSystem = Schemas['AdminSystem']
export type AdminDartSamples = Schemas['AdminDartSamples']
export type DartSample = Schemas['DartSample']
export type DartSampleLabel = Schemas['DartSampleLabel']
export type BuildInfo = Schemas['BuildInfo']
export type BoardLights = Schemas['BoardLights']
export type WledDevice = Schemas['WledDevice']
export type FoundWledDevice = Schemas['FoundWledDevice']
export type LightProfile = Schemas['LightProfile']
export type LightProfileSummary = Schemas['LightProfileSummary']
export type LightRule = Schemas['LightRule']

export type {
  Snapshot,
  UserAction,
  Segment,
  BullOffView,
  X01Game,
  AtcGame,
  MinigolfGame,
  MinigolfHole,
  HiloGame,
  CricketGame,
} from './game-ws'
export { WsCloseCode } from './game-ws'
export { api, createApi } from './client'
export { fetchBoardStatus, runBoardAction, type BoardAction } from './boardActions'
