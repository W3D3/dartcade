import { type Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from './schema.js'

export type BoardShareRow = {
  id: string
  board_id: string
  friend_user_id: string
  status: 'pending' | 'accepted'
  created_at: Date
  responded_at: Date | null
}

export type BoardGrantee = {
  id: string
  friendUserId: string
  friendName: string
  status: 'pending' | 'accepted'
  createdAt: Date
}

export type IncomingBoardShare = {
  id: string
  boardId: string
  boardName: string
  ownerUserId: string
  ownerName: string
  createdAt: Date
}

export type SharedBoardRow = {
  id: string
  name: string
  hardware_id: string | null
  created_at: Date
  owner_name: string
}

/** Throws on a duplicate (board_id, friend_user_id). */
export async function insertBoardShareInvite(
  db: Kysely<Database>,
  boardId: string,
  friendUserId: string,
): Promise<BoardShareRow> {
  const row = await db
    .insertInto('board_shares')
    .values({ id: ulid(), board_id: boardId, friend_user_id: friendUserId })
    .returningAll()
    .executeTakeFirstOrThrow()
  return row as BoardShareRow
}

export async function getBoardShare(db: Kysely<Database>, id: string): Promise<BoardShareRow | undefined> {
  const row = await db.selectFrom('board_shares').selectAll().where('id', '=', id).executeTakeFirst()
  return row as BoardShareRow | undefined
}

/** False if missing or already answered. */
export async function acceptBoardShare(db: Kysely<Database>, id: string, at: Date): Promise<boolean> {
  const result = await db
    .updateTable('board_shares')
    .set({ status: 'accepted', responded_at: at })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .returning('id')
    .executeTakeFirst()
  return result !== undefined
}

/** Removes the row regardless of status. */
export async function deleteBoardShare(db: Kysely<Database>, id: string): Promise<boolean> {
  const result = await db.deleteFrom('board_shares').where('id', '=', id).executeTakeFirst()
  return result.numDeletedRows > 0n
}

export async function hasAcceptedBoardShare(db: Kysely<Database>, boardId: string, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('board_shares')
    .select('id')
    .where('board_id', '=', boardId)
    .where('friend_user_id', '=', userId)
    .where('status', '=', 'accepted')
    .executeTakeFirst()
  return row !== undefined
}

/** Accepted shares only. */
export async function sharedFriendIdsOfBoard(db: Kysely<Database>, boardId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('board_shares')
    .select('friend_user_id')
    .where('board_id', '=', boardId)
    .where('status', '=', 'accepted')
    .execute()
  return rows.map(r => r.friend_user_id)
}

/** Pending + accepted, newest first. */
export async function granteesOfBoard(db: Kysely<Database>, boardId: string): Promise<BoardGrantee[]> {
  const rows = await db
    .selectFrom('board_shares')
    .innerJoin('user', 'user.id', 'board_shares.friend_user_id')
    .select([
      'board_shares.id',
      'board_shares.friend_user_id',
      'user.name as friend_name',
      'board_shares.status',
      'board_shares.created_at',
    ])
    .where('board_shares.board_id', '=', boardId)
    .orderBy('board_shares.created_at', 'desc')
    .execute() as any[]
  return rows.map((r: any) => ({
    id: r.id,
    friendUserId: r.friend_user_id,
    friendName: r.friend_name,
    status: r.status as 'pending' | 'accepted',
    createdAt: r.created_at,
  }))
}

/** Pending only, newest first. */
export async function incomingSharesFor(db: Kysely<Database>, userId: string): Promise<IncomingBoardShare[]> {
  const rows = await db
    .selectFrom('board_shares')
    .innerJoin('boards', 'boards.id', 'board_shares.board_id')
    .innerJoin('user', 'user.id', 'boards.owner_user_id')
    .select([
      'board_shares.id',
      'board_shares.board_id',
      'boards.name as board_name',
      'boards.owner_user_id',
      'user.name as owner_name',
      'board_shares.created_at',
    ])
    .where('board_shares.friend_user_id', '=', userId)
    .where('board_shares.status', '=', 'pending')
    .orderBy('board_shares.created_at', 'desc')
    .execute() as any[]
  return rows.map((r: any) => ({
    id: r.id,
    boardId: r.board_id,
    boardName: r.board_name,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_name,
    createdAt: r.created_at,
  }))
}

/** Accepted only. */
export async function sharedBoardsFor(db: Kysely<Database>, userId: string): Promise<SharedBoardRow[]> {
  return db
    .selectFrom('board_shares')
    .innerJoin('boards', 'boards.id', 'board_shares.board_id')
    .innerJoin('user', 'user.id', 'boards.owner_user_id')
    .select(['boards.id', 'boards.name', 'boards.hardware_id', 'boards.created_at', 'user.name as owner_name'])
    .where('board_shares.friend_user_id', '=', userId)
    .where('board_shares.status', '=', 'accepted')
    .execute() as any
}
