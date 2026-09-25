import type { ColumnType, Generated } from 'kysely'

export interface UserTable {
  id: string
  name: string
  email: string
  email_verified: boolean
  image: string | null
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, never>
}

export interface BoardsTable {
  id: string
  owner_user_id: string
  name: string
  token_hash: string
  hardware_id: string | null
  created_at: ColumnType<Date, never, never>
}

export interface GameSessionsTable {
  id: string
  board_db_id: string | null
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
  user: UserTable
  boards: BoardsTable
  game_sessions: GameSessionsTable
  bridge_events: BridgeEventsTable
}
