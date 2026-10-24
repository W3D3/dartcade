import type { ColumnType, Generated, RawBuilder } from 'kysely'
import type { components } from '../schema/api.js'
import type { SegmentMode } from '../shared/lights/types.js'

// Column names match better-auth's camelCase schema
export interface UserTable {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: ColumnType<Date, never, never>
  updatedAt: ColumnType<Date, never, never>
  /** Broke the name rules or duplicated an older name when names became unique (migration 013): pick a new one. */
  name_needs_change: ColumnType<boolean, boolean | undefined, boolean>
  /** Friends see this user as offline (migration 016). */
  invisible: ColumnType<boolean, boolean | undefined, boolean>
  /** Account-wide preferences, only the ones set (migration 022; API schema Preferences). */
  preferences: ColumnType<components['schemas']['Preferences'], never, RawBuilder<unknown>>
  /** better-auth admin plugin (migration 019): 'admin', 'user' or null. */
  role: ColumnType<string | null, string | null | undefined, string | null>
  banned: ColumnType<boolean | null, boolean | undefined, boolean>
  banReason: string | null
  banExpires: Date | null
  /** Set on every sign-in (databaseHooks.session.create.after, auth/index.ts; migration 026); null until then. */
  last_login_at: Date | null
  /** When sign-up's acceptTerms was accepted; null for accounts from before it (migration 028). */
  terms_accepted_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  /** 'preset' (the Dartcade mark, default for new accounts), 'none' (bare initials), or an uploaded photo (migration 037). */
  avatar_kind: ColumnType<'none' | 'preset' | 'upload', 'none' | 'preset' | 'upload' | undefined, 'none' | 'preset' | 'upload'>
  avatar_preset: string | null
  /** The preset's background colour (hex), chosen independently of the foreground. */
  avatar_color: string | null
  /** The preset's icon colour (hex), chosen independently of the background. */
  avatar_fg_color: string | null
  avatar_image: Buffer | null
  avatar_content_type: string | null
  avatar_version: ColumnType<number, number | undefined, number>
}

export interface BoardsTable {
  id: string
  owner_user_id: string
  name: string
  token_hash: string
  hardware_id: string | null
  created_at: ColumnType<Date, never, never>
  /** Lights master switch for this board (migration 027). */
  lights_enabled: ColumnType<boolean, boolean | undefined, boolean>
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
  /** A moderator marked the game as not counting: it drops out of history, stats and ratings (migration 030). */
  invalidated_at: ColumnType<Date | null, never, Date | null>
  /** Who invalidated it; null once their account is gone. */
  invalidated_by: ColumnType<string | null, never, string | null>
  /** Why, in the moderator's words; optional. */
  invalidation_reason: ColumnType<string | null, never, string | null>
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
  /** The seat is a bot thrown by the server, at this difficulty 1-10; null for a human or guest (migration 017). */
  bot_level: number | null
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
  /** friends: the host's friends join without the code (migration 015). */
  access: ColumnType<string, string | undefined, string>
  /** { gameId, config } as the host last set it. */
  next_game: unknown
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
  /** Played the lobby's last game (migration 023): a rematch plays exactly these again. */
  played_last: ColumnType<boolean, boolean | undefined, boolean>
  /** Who put them on their board when it wasn't their own (or their adder's) pick. */
  board_moved_by: string | null
  joined_at: ColumnType<Date, Date | undefined, never>
  /** Team A, Team B or none (migration 011); used when the next game is played in teams. */
  team: ColumnType<'A' | 'B' | null, 'A' | 'B' | null | undefined, 'A' | 'B' | null>
  /** The person is a bot the server throws itself, at this difficulty 1-10; null for a member or guest (migration 017). */
  bot_level: number | null
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

/** One audio file, stored once per content hash (migration 012). */
export interface VoiceClipsTable {
  sha256: string
  mime: string
  size: number
  bytes: Buffer
}

/** A voice pack a user imported; nobody else sees it. */
export interface VoicePacksTable {
  id: string
  owner_id: string
  name: string
  lang: string | null
  source: 'upload' | 'url'
  source_url: string | null
  created_at: ColumnType<Date, never, never>
}

/** A pack's key → clip mapping, one row per variant. */
export interface VoicePackClipsTable {
  pack_id: string
  key: string
  variant: number
  clip_sha256: string
}

/** A friend request (pending) or a friendship (accepted); one row per pair (migration 014). */
export interface FriendshipsTable {
  id: string
  requester_id: string
  addressee_id: string
  status: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date, never, never>
  responded_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

/** A player's rating in one ranked mode (migration 020). */
export interface RankedRatingsTable {
  user_id: string
  mode: '1v1' | '2v2'
  rating: ColumnType<number, number | undefined, number>
  /** The stage held (0 = Wood I … 29 = Elite V); null while still placing. */
  rank_index: ColumnType<number | null, number | null | undefined, number | null>
  matches: ColumnType<number, number | undefined, number>
  wins: ColumnType<number, number | undefined, number>
  /** Positive: wins in a row; negative: losses in a row. */
  streak: ColumnType<number, number | undefined, number>
  updated_at: ColumnType<Date, Date | undefined, Date>
}

/** What one ranked game did to one player's rating (migration 020). */
export interface RankedResultsTable {
  session_id: string
  user_id: string
  mode: '1v1' | '2v2'
  won: boolean
  /** One of the player's placement matches: its ratings stay hidden. */
  placement: boolean
  rating_before: number
  rating_after: number
  /** The player's 3-dart average in the game. */
  average: number | null
  created_at: ColumnType<Date, Date | undefined, never>
}

/** What an admin or moderator did to someone else's data (migration 029). */
export interface AdminAuditTable {
  /** BIGSERIAL; node-postgres returns it as a string */
  id: Generated<string>
  admin_user_id: string | null
  action: string
  target: string
  detail: ColumnType<unknown, string | undefined, never>
  created_at: ColumnType<Date, never, never>
}

/** A hole an editor can draft and publish; shared across courses (migration 021). */
export interface MinigolfHolesTable {
  id: string
  /** null for official holes (v2: the author). */
  owner_user_id: string | null
  published: unknown
  draft: unknown
  version: ColumnType<number, number | undefined, number>
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, Date>
  published_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

/** A course an editor can draft and publish; holes are shared, referenced by id (migration 021). */
export interface MinigolfCoursesTable {
  id: string
  /** null for official courses. */
  owner_user_id: string | null
  visibility: ColumnType<string, string | undefined, string>
  published: unknown
  draft: unknown
  version: ColumnType<number, number | undefined, number>
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, Date>
  published_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

/** A flag's override, set at runtime (migration 025); no row for a key means today's default. */
export interface FeatureFlagOverridesTable {
  key: string
  /** Null for a number override. */
  mode: ColumnType<
    'off' | 'admins' | 'users' | 'on' | null,
    'off' | 'admins' | 'users' | 'on' | null | undefined,
    'off' | 'admins' | 'users' | 'on' | null
  >
  user_ids: ColumnType<string[], string[] | undefined, string[]>
  /** Null for a mode override. */
  number: number | null
  updated_by: string | null
  updated_at: ColumnType<Date, Date | undefined, Date>
}

/** WLED devices paired to a board (migration 027). */
export interface WledDevicesTable {
  id: string
  board_id: string
  mac: string
  name: string
  host: string
  leds: number
  version: string
  segments: ColumnType<number, number | undefined, number>
  segment_mode: SegmentMode
  max_bri: ColumnType<number, number | undefined, number>
  created_at: ColumnType<Date, never, never>
}

/** XP paid to an account for one reason (migration 032): unique per user, kind, source_type and source_id. */
export interface XpLedgerTable {
  /** BIGSERIAL; node-postgres returns it as a string */
  id: Generated<string>
  user_id: string
  kind: string
  source_type: string
  source_id: string
  amount: number
  /** DATE, written as YYYY-MM-DD; select it as `local_date::text` (pg reads a DATE as a Date) */
  local_date: ColumnType<string, string, never>
  meta: ColumnType<Record<string, unknown>, string | undefined, never>
  created_at: ColumnType<Date, Date | undefined, never>
}

/** An account's XP total, level and day streak (migration 032); rebuildable from xp_ledger. */
export interface UserProgressTable {
  user_id: string
  xp_total: ColumnType<number, number | undefined, number>
  level: ColumnType<number, number | undefined, number>
  streak_current: ColumnType<number, number | undefined, number>
  streak_best: ColumnType<number, number | undefined, number>
  /** DATE; select it as text, like xp_ledger.local_date */
  streak_last_date: ColumnType<string | null, string | null | undefined, string | null>
  freezes: ColumnType<number, number | undefined, number>
  updated_at: ColumnType<Date, Date | undefined, Date>
}

/** One slot of a daily or weekly challenge set (migration 033). */
export interface UserChallengesTable {
  id: string
  user_id: string
  period: 'daily' | 'weekly'
  /** DATE; select it as text, like xp_ledger.local_date */
  period_key: ColumnType<string, string, never>
  slot: number
  template_id: string
  target: number
  progress: ColumnType<number, number | undefined, number>
  xp: number
  completed_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  /** Paid (migration 036): claimed, or settled after its period ended */
  claimed_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  reroll: ColumnType<number, number | undefined, number>
  state: ColumnType<Record<string, unknown>, string | undefined, string>
  created_at: ColumnType<Date, never, never>
}

/** A cosmetic perk an account has unlocked (migration 034). */
export interface UserUnlocksTable {
  user_id: string
  perk_id: string
  source: string
  unlocked_at: ColumnType<Date, Date | undefined, never>
}

export interface ProgressionBackfillTable {
  done_at: ColumnType<Date, Date | undefined, never>
}

/** A game the ranked queue started, with who played on which side (migration 037). */
export interface RankedMatchesTable {
  session_id: string
  mode: '1v1' | '2v2'
  /** The user ids of each side's players (written as JSON). */
  sides: ColumnType<[string[], string[]], string, never>
  created_at: ColumnType<Date, Date | undefined, never>
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
  voice_clips: VoiceClipsTable
  voice_packs: VoicePacksTable
  voice_pack_clips: VoicePackClipsTable
  friendships: FriendshipsTable
  ranked_ratings: RankedRatingsTable
  ranked_results: RankedResultsTable
  minigolf_holes: MinigolfHolesTable
  minigolf_courses: MinigolfCoursesTable
  feature_flag_overrides: FeatureFlagOverridesTable
  wled_devices: WledDevicesTable
  admin_audit: AdminAuditTable
  xp_ledger: XpLedgerTable
  user_progress: UserProgressTable
  progression_backfill: ProgressionBackfillTable
  user_challenges: UserChallengesTable
  user_unlocks: UserUnlocksTable
  ranked_matches: RankedMatchesTable
}
