import type { ColumnType, Generated } from 'kysely'

// Column names match better-auth's camelCase schema
export interface UserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: ColumnType<Date, never, never>
  updatedAt: ColumnType<Date, never, never>
}

export interface BoardsTable {
  id: string
  owner_user_id: string
  name: string
  token_hash: string
  hardware_id: string | null
  created_at: ColumnType<Date, never, never>
}

export interface PairingCodesTable {
  code: string
  created_at: ColumnType<Date, never, never>
  expires_at: Date
  claimed_at: Date | null
  raw_token: string | null
  board_id: string | null
}

export interface GameSessionsTable {
  id: string
  owner_user_id: string | null
  board_db_id: string | null
  game_id: string
  config: unknown
  status: string
  created_at: ColumnType<Date, never, never>
  finished_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  game_version: ColumnType<number, number | undefined, number>
  rng_seed: ColumnType<number, number | undefined, number>
  visibility: ColumnType<string, string | undefined, string>
}

export interface GamePlayersTable {
  session_id: string
  seat: number
  name: string
  user_id: string | null
  placement: number | null
  stats: unknown
  /** Where the seat threw in the game (0 = first); set with the result. */
  throw_position: number | null
}

export interface GameSessionEventsTable {
  session_id: string
  seq: number
  source: string
  kind: string
  data: unknown
  /** BIGINT; node-postgres returns it as a string */
  bridge_event_id: string | null
  created_at: Date
}

export interface GameDartsTable {
  session_id: string
  visit: number
  dart_index: number
  seat: number
  leg: number
  phase: string
  segment: unknown
  coords: unknown
  source: string
  corrected: boolean
  thrown_at: Date
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
  pairing_codes: PairingCodesTable
  game_sessions: GameSessionsTable
  game_players: GamePlayersTable
  game_session_events: GameSessionEventsTable
  game_darts: GameDartsTable
  bridge_events: BridgeEventsTable
}
