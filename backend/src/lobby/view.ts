import type { Lobby, LobbySummary, PendingInvite } from '../schema/lobby-ws.js'
import type { Session } from '../session/types.js'
import { currentSeat } from '../session/access.js'
import type { InviteRow, LobbyState } from './types.js'

/** What a view needs besides the lobby: who has it open, which boards are online, its running game. */
export type ViewContext = { online: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean; sessionId: string | null }

/** The lobby as its socket pushes it (schema/lobby-ws-v1.json). */
export function lobbyView(lobby: LobbyState, ctx: ViewContext): Lobby {
  return {
    id: lobby.id,
    name: lobby.name,
    code: lobby.code,
    hostUserId: lobby.hostUserId,
    throwOrder: lobby.throwOrder,
    nextGame: lobby.nextGame,
    canRematch: lobby.lastGame !== null,
    currentSessionId: ctx.sessionId,
    createdAt: lobby.createdAt.toISOString(),
    people: lobby.people.map(p => ({
      id: p.id, userId: p.userId, addedByUserId: p.addedByUserId, name: p.name,
      boardId: p.boardId, boardName: p.boardName, boardOwnerUserId: p.boardOwnerUserId,
      boardOnline: p.boardId !== null && ctx.isBoardOnline(p.boardId),
      boardMovedBy: p.boardMovedBy, usualBoardName: p.usualBoardName, plays: p.plays, ready: p.ready,
      presence: p.userId === null ? null : ctx.online.has(p.userId) ? 'online' : 'away',
    })),
    invites: lobby.invites.map(i => ({
      id: i.id, userId: i.userId, name: i.name, invitedByUserId: i.invitedByUserId, createdAt: i.createdAt.toISOString(),
    })),
    activity: lobby.activity.map(a => ({
      id: a.id, at: a.at.toISOString(), kind: a.kind, actorUserId: a.actorUserId, actorName: a.actorName, data: a.data,
    })),
  }
}

/** The user's lobby as the indicator shows it (/ws/me). */
export function lobbySummary(lobby: LobbyState, userId: string, session: Session | undefined): LobbySummary {
  return {
    id: lobby.id,
    name: lobby.name,
    peopleCount: lobby.people.length,
    nextGame: lobby.nextGame,
    sessionId: session?.id ?? null,
    gameId: session?.module.id ?? null,
    youThrowNext: session !== undefined && session.seats[currentSeat(session)].controllerUserId === userId,
    leg: session?.module.getLeg?.(session.currentState) ?? null,
    youHost: lobby.hostUserId === userId,
  }
}

/** A pending invite as its invitee sees it: on /ws/me and from GET /api/invites. */
export function inviteView(row: InviteRow): PendingInvite {
  return {
    id: row.id, lobbyId: row.lobbyId, lobbyName: row.lobbyName,
    inviterUserId: row.inviterUserId, inviterName: row.inviterName, createdAt: row.createdAt.toISOString(),
  }
}
