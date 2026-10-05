import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { getBoardById } from '../db/queries.js'

export type BoardRow = NonNullable<Awaited<ReturnType<typeof getBoardById>>>

/** The board if it exists and the user owns it; otherwise why not (each caller answers in its own words). */
export async function findOwnBoard(
  db: Kysely<Database>,
  boardId: string,
  userId: string,
): Promise<{ board: BoardRow } | { problem: 'not_found' | 'not_owner' }> {
  const board = await getBoardById(db, boardId)
  if (!board) return { problem: 'not_found' }
  if (board.owner_user_id !== userId) return { problem: 'not_owner' }
  return { board }
}
