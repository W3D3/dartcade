import type { components } from './schema'

type Schemas = components['schemas']
export type Board = Schemas['Board']
export type BoardStatus = Schemas['BoardStatus']
export type BoardEvent = Schemas['BoardEvent']
export type GameInfo = Schemas['GameInfo']
export type ConfigFieldMeta = Schemas['ConfigFieldMeta']
export type SessionSummary = Schemas['SessionSummary']
export type ErrorResponse = Schemas['ErrorResponse']

export type { Snapshot, UserAction, Segment, BullOffView, X01Game, AtcGame } from './game-ws'
export { WsCloseCode } from './game-ws'
export { api, createApi } from './client'
export { runBoardAction, type BoardAction } from './boardActions'
