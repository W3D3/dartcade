import type { Lobby, LobbySummary, PendingInvite } from '../schema/lobby-ws.js'
import type { Session } from '../session/types.js'
import { currentSeat } from '../session/access.js'
import { effectiveReady, isSolo, memberOf, nextHost } from './rules.js'
import type { InviteRow, LobbyState } from './types.js'

/** The host's name; null with no host, or one who isn't in the lobby (yet). */
const hostNameOf = (lobby: LobbyState): string | null =>
  lobby.hostUserId === null ? null : (memberOf(lobby, lobby.hostUserId)?.name ?? null)

/** What a view needs besides the lobby: who has it open, which boards are online, its running game. */
export type ViewContext = { online: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean; sessionId: string | null }

/** The lobby as its socket pushes it (schema/lobby-ws-v1.json). */
export function lobbyView(lobby: LobbyState, ctx: ViewContext): Lobby {
  return {
    id: lobby.id,
    name: lobby.name,
    code: lobby.code,
    hostUserId: lobby.hostUserId,
    hostName: hostNameOf(lobby),
    throwOrder: lobby.throwOrder,
    access: lobby.access,
    nextGame: lobby.nextGame,
    currentSessionId: ctx.sessionId,
    createdAt: lobby.createdAt.toISOString(),
    solo: isSolo(lobby),
    nextHostName: nextHost(lobby)?.name ?? null,
    people: lobby.people.map(p => ({
      id: p.id,
      userId: p.userId,
      addedByUserId: p.addedByUserId,
      name: p.name,
      boardId: p.boardId,
      boardName: p.boardName,
      boardOwnerUserId: p.boardOwnerUserId,
      boardOnline: p.boardId !== null && ctx.isBoardOnline(p.boardId),
      boardMovedBy: p.boardMovedBy,
      usualBoardName: p.usualBoardName,
      plays: p.plays,
      ready: effectiveReady(lobby, p),
      team: p.team,
      presence: p.userId === null ? null : ctx.online.has(p.userId) ? 'online' : 'away',
      bot: p.bot,
    })),
    invites: lobby.invites.map(i => ({
      id: i.id,
      userId: i.userId,
      name: i.name,
      invitedByUserId: i.invitedByUserId,
      createdAt: i.createdAt.toISOString(),
    })),
    activity: lobby.activity.map(a => ({
      id: a.id,
      at: a.at.toISOString(),
      kind: a.kind,
      actorUserId: a.actorUserId,
      actorName: a.actorName,
      data: a.data,
    })),
  }
}

/** The user's lobby as the indicator shows it (/ws/me). */
export function lobbySummary(lobby: LobbyState, userId: string, session: Session | undefined): LobbySummary {
  return {
    id: lobby.id,
    name: lobby.name,
    hostName: hostNameOf(lobby),
    peopleCount: lobby.people.length,
    nextGame: lobby.nextGame,
    sessionId: session?.id ?? null,
    gameId: session?.module.id ?? null,
    // A bot's seat is controlled by whoever added it, but they don't throw for it themselves
    youThrowNext:
      session !== undefined &&
      session.seats[currentSeat(session)].controllerUserId === userId &&
      session.seats[currentSeat(session)].bot === null,
    leg: session?.module.getLeg?.(session.currentState) ?? null,
    youHost: lobby.hostUserId === userId,
    solo: isSolo(lobby),
    hasBot: lobby.people.some(p => p.bot !== null),
  }
}

/** A pending invite as its invitee sees it: on /ws/me and from GET /api/invites. */
export function inviteView(row: InviteRow): PendingInvite {
  return {
    id: row.id,
    lobbyId: row.lobbyId,
    lobbyName: row.lobbyName,
    inviterUserId: row.inviterUserId,
    inviterName: row.inviterName,
    createdAt: row.createdAt.toISOString(),
  }
}
