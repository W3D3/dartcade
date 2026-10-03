import type { GameConfig } from '../session/types.js'

/** lobby: as the lobby lists people. random: shuffled per game. bulloff: a bull off decides. */
export type ThrowOrder = 'lobby' | 'random' | 'bulloff'

/** The game the host set up next. */
export type NextGame = { gameId: string; config: GameConfig }

/** The game a lobby start creates: the next game, with who plays (lobby person ids). */
export type StartGame = NextGame & { personIds: string[] }

/** A lobby's two teams; inside a game they're team indices 0 and 1. */
export type TeamId = 'A' | 'B'

/** A member (userId set) or a guest at a member's board (userId null). */
export type LobbyPerson = {
  id: string
  userId: string | null
  /** The member themselves; for a guest, who added them (and controls their seat). */
  addedByUserId: string
  name: string
  boardId: string | null
  boardName: string | null
  boardOwnerUserId: string | null
  position: number
  plays: boolean
  ready: boolean
  boardMovedBy: string | null
  joinedAt: Date
  /** A member's usual board (latest game's own board, else first paired); null for guests. */
  usualBoardName: string | null
  /** Their team, kept from game to game (and while the next game is singles); null: none yet. */
  team: TeamId | null
}

/** Someone invited into the lobby who hasn't answered yet. */
export type LobbyInvitee = { id: string; userId: string; name: string; invitedByUserId: string | null; createdAt: Date }

export const ACTIVITY_KINDS = [
  'opened', 'joined', 'left', 'removed', 'guest_added', 'board_moved', 'game_played', 'game_aborted', 'host_changed',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export type ActivityPlayer = { name: string; placement: number; forfeited: boolean }

/**
 * What an activity line shows, stored with names as they were then. Per kind:
 * opened/joined/left/removed/guest_added/host_changed: name. board_moved: name, userId
 * (the person moved; null for a guest), fromBoardName, toBoardName. game_played:
 * sessionId, gameId, winnerName, players. game_aborted: sessionId, gameId.
 */
export type ActivityData = {
  name?: string
  userId?: string | null
  fromBoardName?: string | null
  toBoardName?: string | null
  sessionId?: string
  gameId?: string
  winnerName?: string | null
  players?: ActivityPlayer[]
}

export type LobbyActivityEntry = {
  id: string; at: Date; kind: ActivityKind; actorUserId: string | null; actorName: string | null; data: ActivityData
}

/** A lobby as loaded from the database. */
export type LobbyState = {
  id: string
  name: string
  hostUserId: string | null
  code: string
  throwOrder: ThrowOrder
  nextGame: NextGame | null
  createdAt: Date
  closedAt: Date | null
  /** In lobby order. */
  people: LobbyPerson[]
  /** Pending invites, oldest first. */
  invites: LobbyInvitee[]
  /** Newest first, at most ACTIVITY_LIMIT. */
  activity: LobbyActivityEntry[]
}

/** A pending invite as its invitee sees it. */
export type InviteRow = {
  id: string; lobbyId: string; lobbyName: string; inviterUserId: string | null; inviterName: string | null; createdAt: Date
}
