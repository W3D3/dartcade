import type { ColumnType, Generated } from 'kysely'

export interface SessionsTable {
  id: string
  board_id: string
  game_id: string
  config: unknown
  players: unknown
  status: string
  created_at: ColumnType<Date, never, never>
}

export interface BridgeEventsTable {
  id: Generated<bigint>
  bridge_id: string
  boot_id: string
  seq: bigint
  board_id: string
  recv_wall: Date
  kind: string
  data: unknown
  inserted_at: ColumnType<Date, never, never>
}

export interface Database {
  sessions: SessionsTable
  bridge_events: BridgeEventsTable
}
