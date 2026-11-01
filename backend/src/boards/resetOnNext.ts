// Next player pulls the darts out of the game; the board's own reset clears them from Board Manager too,
// so the next player starts on a clean board. Best effort and not awaited: the turn has passed already.
// A reset wipes every dart Board Manager holds, so it is skipped once a dart of the next visit has arrived.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { getBoardById } from '../db/queries.js'
import { askBoard, BM_TIMEOUT_MS } from './bmState.js'

export function resetBoardOnNext(
  db: Kysely<Database>,
  boardId: string,
  boardIsClear: () => boolean,
  warn: (message: string, details: unknown) => void,
): void {
  void (async () => {
    if (!(await getBoardById(db, boardId))?.reset_on_next || !boardIsClear()) return
    const reset = await askBoard(boardId, { op: 'reset' }, BM_TIMEOUT_MS)
    if (!reset.ok) warn('board reset on next player failed', { boardId, error: reset.error })
  })().catch((err: unknown) => {
    warn('board reset on next player failed', { boardId, error: String(err) })
  })
}
