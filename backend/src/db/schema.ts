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
  /** The lobby the game was started from; null for local games. */
  lobby_id: ColumnType<string | null, string | null | undefined, string | null>
  /** Who aborted the game (the host); null otherwise. */
  aborted_by_user_id: ColumnType<string | null, string | null | undefined, string | null>
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
  /** Who may act for the seat (the owner in local games). */
  controller_user_id: string | null
  /** Where the seat's darts come from; null = entered by hand. */
  board_db_id: string | null
  forfeited: ColumnType<boolean, boolean | undefined, boolean>
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
  /** The board a 'board' event came from. */
  board_db_id: string | null
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

export interface LobbiesTable {
  id: string
  name: string
  /** null only once the host's account is gone; the next change hands over. */
  host_user_id: string | null
  /** 6 characters, unique among open lobbies. */
  code: string
  throw_order: ColumnType<string, string | undefined, string>
  /** { gameId, config } as the host last set it. */
  next_game: unknown
  /** { gameId, config, personIds } of the last game started here: what a rematch repeats. */
  last_game: unknown
  created_at: ColumnType<Date, never, never>
  closed_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

export interface LobbyPeopleTable {
  id: string
  lobby_id: string
  /** Set for members, null for a guest. */
  user_id: string | null
  /** The member themselves; for a guest, who added them (and acts for them in games). */
  added_by_user_id: string
  name: string
  /** null: Manual (darts entered by hand). */
  board_id: string | null
  position: number
  plays: ColumnType<boolean, boolean | undefined, boolean>
  ready: ColumnType<boolean, boolean | undefined, boolean>
  /** Who put them on their board when it wasn't their own (or their adder's) pick. */
  board_moved_by: string | null
  joined_at: ColumnType<Date, Date | undefined, never>
}

export interface LobbyInvitesTable {
  id: string
  lobby_id: string
  invitee_user_id: string
  inviter_user_id: string | null
  status: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date, never, never>
}

export interface LobbyActivityTable {
  /** BIGSERIAL; node-postgres returns it as a string */
  id: Generated<string>
  lobby_id: string
  at: ColumnType<Date, Date | undefined, never>
  kind: string
  actor_user_id: string | null
  data: unknown
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
  lobbies: LobbiesTable
  lobby_people: LobbyPeopleTable
  lobby_invites: LobbyInvitesTable
  lobby_activity: LobbyActivityTable
}
