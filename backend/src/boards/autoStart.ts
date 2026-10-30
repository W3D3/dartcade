// A lobby game that seats a board starts the board's Board Manager session if it was stopped, so
// the host needn't press Start there. Best effort: the game has started already, a failure is logged.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { getBoardById } from '../db/queries.js'
import { askBoard, BM_TIMEOUT_MS, stateOf } from './bmState.js'

export async function autoStartBoards(
  db: Kysely<Database>,
  boardIds: string[],
  warn: (message: string, details: unknown) => void,
): Promise<void> {
  await Promise.all(
    [...new Set(boardIds)].map(async id => {
      try {
        if (!(await getBoardById(db, id))?.auto_start) return
        const state = await askBoard(id, { op: 'state' }, BM_TIMEOUT_MS)
        if (!state.ok || stateOf(state.res)?.status !== 'Stopped') return
        const started = await askBoard(id, { op: 'start' }, BM_TIMEOUT_MS)
        if (!started.ok) warn('board auto-start failed', { boardId: id, error: started.error })
      } catch (err) {
        warn('board auto-start failed', { boardId: id, error: String(err) })
      }
    }),
  )
}
