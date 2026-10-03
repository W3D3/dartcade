import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import {
  ACTIVITY_KINDS, type ActivityData, type ActivityKind, type InviteRow, type LastGame, type LobbyState, type NextGame, type ThrowOrder,
} from '../lobby/types.js'

/** How many activity lines a lobby shows (newest first). */
export const ACTIVITY_LIMIT = 50

export type NewLobby = { id: string; name: string; hostUserId: string; code: string }
export type NewPerson = {
  id: string; lobbyId: string; userId: string | null; addedByUserId: string; name: string
  boardId: string | null; ready: boolean; joinedAt?: Date
}
export type LobbyUpdate = {
  name?: string; host_user_id?: string | null; code?: string; throw_order?: ThrowOrder
  next_game?: NextGame | null; last_game?: LastGame | null
}
export type PersonUpdate = { board_id?: string | null; board_moved_by?: string | null; plays?: boolean; ready?: boolean }

// JSON columns are read defensively: a value that doesn't parse reads as absent
const ConfigSchema = z.record(z.string(), z.unknown())
const NextGameSchema = z.object({ gameId: z.string(), config: ConfigSchema })
const LastGameSchema = NextGameSchema.extend({ personIds: z.array(z.string()) })
const ThrowOrderSchema = z.enum(['lobby', 'random', 'bulloff'])
const ActivityKindSchema = z.enum(ACTIVITY_KINDS)
const ActivityDataSchema = z.object({
  name: z.string().optional(),
  userId: z.string().nullable().optional(),
  fromBoardName: z.string().nullable().optional(),
  toBoardName: z.string().nullable().optional(),
  sessionId: z.string().optional(),
  gameId: z.string().optional(),
  winnerName: z.string().nullable().optional(),
  players: z.array(z.object({ name: z.string(), placement: z.number().int(), forfeited: z.boolean() })).optional(),
})

function parsed<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const r = schema.safeParse(value)
  return r.success ? r.data : null
}

const json = (v: NextGame | LastGame | null): string | null => v === null ? null : JSON.stringify(v)

/** A new lobby with its host as the first person and an "opened" line. Its own transaction. */
export async function insertLobby(db: Kysely<Database>, lobby: NewLobby, host: Omit<NewPerson, 'lobbyId'>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('lobbies').values({ id: lobby.id, name: lobby.name, host_user_id: lobby.hostUserId, code: lobby.code }).execute()
    await insertPerson(trx, { ...host, lobbyId: lobby.id })
    await addActivity(trx, lobby.id, 'opened', lobby.hostUserId, { name: host.name })
  })
}

/** Adds a person at the end of the lobby order. */
export async function insertPerson(db: Kysely<Database>, p: NewPerson): Promise<void> {
  await db.insertInto('lobby_people').values({
    id: p.id, lobby_id: p.lobbyId, user_id: p.userId, added_by_user_id: p.addedByUserId, name: p.name,
    board_id: p.boardId, ready: p.ready, board_moved_by: null, joined_at: p.joinedAt ?? new Date(),
    position: sql<number>`(SELECT COALESCE(MAX(position) + 1, 0) FROM lobby_people WHERE lobby_id = ${p.lobbyId})`,
  }).execute()
}

export async function getOpenLobbyIdOfUser(db: Kysely<Database>, userId: string): Promise<string | undefined> {
  const row = await db.selectFrom('lobby_people').select('lobby_id').where('user_id', '=', userId).executeTakeFirst()
  return row?.lobby_id
}

export async function getOpenLobbyIds(db: Kysely<Database>): Promise<string[]> {
  const rows = await db.selectFrom('lobbies').select('id').where('closed_at', 'is', null).execute()
  return rows.map(r => r.id)
}

export async function getOpenLobbyIdByCode(db: Kysely<Database>, code: string): Promise<string | undefined> {
  const row = await db.selectFrom('lobbies').select('id').where('code', '=', code).where('closed_at', 'is', null).executeTakeFirst()
  return row?.id
}

/**
 * Each user's usual board: the own board of their latest game that had one, else the
 * first board they paired. A joiner starts on it; the lobby shows it as "usually X".
 */
export async function usualBoards(db: Kysely<Database>, userIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const usual = new Map<string, { id: string; name: string }>()
  if (userIds.length === 0) return usual
  const recent = await db.selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .innerJoin('boards as b', 'b.id', 'gp.board_db_id')
    .select(['gp.controller_user_id as user_id', 'b.id', 'b.name'])
    .where('gp.controller_user_id', 'in', userIds)
    .whereRef('b.owner_user_id', '=', 'gp.controller_user_id')
    .distinctOn('gp.controller_user_id')
    .orderBy('gp.controller_user_id').orderBy('gs.created_at', 'desc')
    .execute()
  for (const r of recent) if (r.user_id !== null) usual.set(r.user_id, { id: r.id, name: r.name })
  const owned = await db.selectFrom('boards').select(['owner_user_id', 'id', 'name'])
    .where('owner_user_id', 'in', userIds).orderBy('created_at').orderBy('id').execute()
  for (const b of owned) if (!usual.has(b.owner_user_id)) usual.set(b.owner_user_id, { id: b.id, name: b.name })
  return usual
}

/** The lobby with its people (board names, owners, usual boards), pending invites and feed. */
export async function loadLobby(db: Kysely<Database>, id: string): Promise<LobbyState | undefined> {
  const row = await db.selectFrom('lobbies').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return undefined
  const people = await db.selectFrom('lobby_people as p')
    .leftJoin('boards as b', 'b.id', 'p.board_id')
    .select([
      'p.id', 'p.user_id', 'p.added_by_user_id', 'p.name', 'p.board_id', 'b.name as board_name', 'b.owner_user_id as board_owner_user_id',
      'p.position', 'p.plays', 'p.ready', 'p.board_moved_by', 'p.joined_at',
    ])
    .where('p.lobby_id', '=', id)
    .orderBy('p.position').orderBy('p.joined_at')
    .execute()
  const usual = await usualBoards(db, people.flatMap(p => p.user_id === null ? [] : [p.user_id]))
  const invites = await db.selectFrom('lobby_invites as i')
    .innerJoin('user as u', 'u.id', 'i.invitee_user_id')
    .select(['i.id', 'i.invitee_user_id', 'u.name', 'i.inviter_user_id', 'i.created_at'])
    .where('i.lobby_id', '=', id).where('i.status', '=', 'pending')
    .orderBy('i.created_at')
    .execute()
  const activity = await db.selectFrom('lobby_activity as a')
    .leftJoin('user as u', 'u.id', 'a.actor_user_id')
    .select(['a.id', 'a.at', 'a.kind', 'a.actor_user_id', 'u.name as actor_name', 'a.data'])
    .where('a.lobby_id', '=', id)
    .orderBy('a.id', 'desc')
    .limit(ACTIVITY_LIMIT)
    .execute()
  return {
    id: row.id, name: row.name, hostUserId: row.host_user_id, code: row.code,
    throwOrder: parsed(ThrowOrderSchema, row.throw_order) ?? 'lobby',
    nextGame: parsed(NextGameSchema, row.next_game),
    lastGame: parsed(LastGameSchema, row.last_game),
    createdAt: row.created_at, closedAt: row.closed_at,
    people: people.map(p => ({
      id: p.id, userId: p.user_id, addedByUserId: p.added_by_user_id, name: p.name,
      boardId: p.board_id, boardName: p.board_name, boardOwnerUserId: p.board_owner_user_id,
      position: p.position, plays: p.plays, ready: p.ready, boardMovedBy: p.board_moved_by, joinedAt: p.joined_at,
      usualBoardName: p.user_id === null ? null : usual.get(p.user_id)?.name ?? null,
    })),
    invites: invites.map(i => ({ id: i.id, userId: i.invitee_user_id, name: i.name, invitedByUserId: i.inviter_user_id, createdAt: i.created_at })),
    activity: activity.flatMap(a => {
      // A kind this build doesn't know (written by a newer one) is left out
      const kind = parsed(ActivityKindSchema, a.kind)
      if (kind === null) return []
      return [{ id: a.id, at: a.at, kind, actorUserId: a.actor_user_id, actorName: a.actor_name, data: parsed(ActivityDataSchema, a.data) ?? {} }]
    }),
  }
}

export async function updateLobby(db: Kysely<Database>, id: string, u: LobbyUpdate): Promise<void> {
  const { next_game, last_game, ...plain } = u
  await db.updateTable('lobbies').set({
    ...plain,
    ...(next_game === undefined ? {} : { next_game: json(next_game) }),
    ...(last_game === undefined ? {} : { last_game: json(last_game) }),
  }).where('id', '=', id).execute()
}

export async function updatePerson(db: Kysely<Database>, id: string, u: PersonUpdate): Promise<void> {
  await db.updateTable('lobby_people').set(u).where('id', '=', id).execute()
}

/** Rewrites the lobby order: `ids` first to last. */
export async function setPositions(db: Kysely<Database>, lobbyId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  // one statement, so a reorder lands whole or not at all
  await db.updateTable('lobby_people')
    .set({ position: sql<number>`array_position(${ids}::text[], id) - 1` })
    .where('lobby_id', '=', lobbyId)
    .where('id', 'in', ids)
    .execute()
}

/** Exactly these people play the game that starts; the others sit it out. */
export async function setPlaying(db: Kysely<Database>, lobbyId: string, personIds: string[]): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ plays: sql<boolean>`id = ANY(${personIds})` })
    .where('lobby_id', '=', lobbyId)
    .execute()
}

export async function deletePeople(db: Kysely<Database>, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.deleteFrom('lobby_people').where('id', 'in', ids).execute()
}

/** People in the lobby on one of the owner's boards go to Manual: the boards left with their owner. */
export async function clearBoardsOf(db: Kysely<Database>, lobbyId: string, ownerUserId: string): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ board_id: null, board_moved_by: null })
    .where('lobby_id', '=', lobbyId)
    .where('board_id', 'in', db.selectFrom('boards').select('id').where('owner_user_id', '=', ownerUserId))
    .execute()
}

/** A board is going away: everyone on it in any lobby goes to Manual. Returns the lobbies changed. */
export async function releaseBoard(db: Kysely<Database>, boardId: string): Promise<string[]> {
  const rows = await db.updateTable('lobby_people')
    .set({ board_id: null, board_moved_by: null })
    .where('board_id', '=', boardId)
    .returning('lobby_id')
    .execute()
  return [...new Set(rows.map(r => r.lobby_id))]
}

/** After every game: everyone is back in; members are not ready again, guests are. */
export async function resetAfterGame(db: Kysely<Database>, lobbyId: string): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ plays: true, ready: sql<boolean>`user_id IS NULL` })
    .where('lobby_id', '=', lobbyId)
    .execute()
}

export async function addActivity(db: Kysely<Database>, lobbyId: string, kind: ActivityKind, actorUserId: string | null, data: ActivityData): Promise<void> {
  await db.insertInto('lobby_activity').values({ lobby_id: lobbyId, kind, actor_user_id: actorUserId, data: JSON.stringify(data) }).execute()
}

/** Closes the lobby: its people and feed go, pending invites expire. Returns who had one. Its own transaction. */
export async function closeLobbyRows(db: Kysely<Database>, lobbyId: string, at: Date): Promise<string[]> {
  return db.transaction().execute(async (trx) => {
    await trx.deleteFrom('lobby_people').where('lobby_id', '=', lobbyId).execute()
    await trx.deleteFrom('lobby_activity').where('lobby_id', '=', lobbyId).execute()
    const expired = await trx.updateTable('lobby_invites')
      .set({ status: 'expired' })
      .where('lobby_id', '=', lobbyId).where('status', '=', 'pending')
      .returning('invitee_user_id')
      .execute()
    await trx.updateTable('lobbies').set({ closed_at: at }).where('id', '=', lobbyId).execute()
    return expired.map(r => r.invitee_user_id)
  })
}

export async function insertInvite(db: Kysely<Database>, i: { id: string; lobbyId: string; inviteeUserId: string; inviterUserId: string }): Promise<void> {
  await db.insertInto('lobby_invites').values({ id: i.id, lobby_id: i.lobbyId, invitee_user_id: i.inviteeUserId, inviter_user_id: i.inviterUserId }).execute()
}

export async function getInvite(db: Kysely<Database>, id: string) {
  return db.selectFrom('lobby_invites').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function setInviteStatus(db: Kysely<Database>, id: string, status: 'accepted' | 'declined'): Promise<void> {
  await db.updateTable('lobby_invites').set({ status }).where('id', '=', id).where('status', '=', 'pending').execute()
}

/** The user joined: their pending invites to this lobby are accepted. */
export async function acceptInvites(db: Kysely<Database>, lobbyId: string, userId: string): Promise<void> {
  await db.updateTable('lobby_invites').set({ status: 'accepted' })
    .where('lobby_id', '=', lobbyId).where('invitee_user_id', '=', userId).where('status', '=', 'pending')
    .execute()
}

/** The user's pending invites to open lobbies, newest first. */
export async function pendingInvitesFor(db: Kysely<Database>, userId: string): Promise<InviteRow[]> {
  const rows = await db.selectFrom('lobby_invites as i')
    .innerJoin('lobbies as l', 'l.id', 'i.lobby_id')
    .leftJoin('user as u', 'u.id', 'i.inviter_user_id')
    .select(['i.id', 'i.lobby_id', 'l.name as lobby_name', 'i.inviter_user_id', 'u.name as inviter_name', 'i.created_at'])
    .where('i.invitee_user_id', '=', userId).where('i.status', '=', 'pending').where('l.closed_at', 'is', null)
    .orderBy('i.created_at', 'desc')
    .execute()
  return rows.map(r => ({
    id: r.id, lobbyId: r.lobby_id, lobbyName: r.lobby_name, inviterUserId: r.inviter_user_id, inviterName: r.inviter_name, createdAt: r.created_at,
  }))
}
