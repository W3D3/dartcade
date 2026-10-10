import type { components } from './schema'

type Schemas = components['schemas']
export type Board = Schemas['Board']
export type BoardStatus = Schemas['BoardStatus']
export type BoardEvent = Schemas['BoardEvent']
export type GameInfo = Schemas['GameInfo']
export type ConfigFieldMeta = Schemas['ConfigFieldMeta']
export type SessionSummary = Schemas['SessionSummary']
export type ErrorResponse = Schemas['ErrorResponse']
export type GameSummary = Schemas['GameSummary']
export type GameStats = Schemas['GameStats']
export type GameSeat = Schemas['GameSeat']
export type GameDetail = Schemas['GameDetail']
export type MatchStats = Schemas['MatchStats']
export type StatRow = Schemas['StatRow']
export type StatValues = Schemas['StatValues']
export type X01Detail = Schemas['X01Detail']
export type AtcDetail = Schemas['AtcDetail']
export type VoicePackSummary = Schemas['VoicePackSummary']
export type VoicePackImport = Schemas['VoicePackImport']
export type VoicePackList = Schemas['VoicePackList']

export type { Snapshot, UserAction, Segment, BullOffView, X01Game, AtcGame, MinigolfGame, MinigolfHole } from './game-ws'
export { WsCloseCode } from './game-ws'
export { api, createApi } from './client'
export { runBoardAction, type BoardAction } from './boardActions'
