import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { claimBigScreenToken, clearBigScreenToken, getBoardById } from '../db/queries.js'
import { bridgeConnections } from '../bridge-gw/connections.js'
import { newBoardToken } from './token.js'
import { flagEnabled, loadFlagUser } from '../flags/index.js'
import type { BigScreenService } from '../bigscreen/service.js'
import type { WsCloseCode } from '../schema/game-ws.js'

type Warn = (message: string, details: unknown) => void
type Revoker = Pick<BigScreenService, 'revoke'>

/** The page the bridge's helper opens: the public app URL with a fresh token for the board. */
export function bigScreenUrl(boardId: string, token: string): string | null {
  const base = (process.env.PUBLIC_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '')
  if (!base) return null
  return `${base}/#/big-screen/${boardId}?k=${token}`
}

/**
 * Has the board's helper open the big screen with a new token. `disabled`: the owner doesn't have
 * the bigscreen.enabled flag (nothing is minted or sent); `off`: the board's setting is off (also
 * when it was switched off meanwhile: the token is stored only while it isn't); `offline`: the
 * bridge isn't connected; `no_url`: the server doesn't know its public URL. `bigScreen.revoke`
 * cuts the sockets of the token it replaces.
 */
export async function openBigScreen(
  db: Kysely<Database>,
  board: { id: string; owner_user_id: string; big_screen_mode: string },
  bigScreen: Revoker,
  warn: Warn,
): Promise<'ok' | 'disabled' | 'off' | 'offline' | 'no_url'> {
  if (board.big_screen_mode === 'off') return 'off'
  if (!(await flagEnabled('bigscreen.enabled', await loadFlagUser(db, board.owner_user_id)))) return 'disabled'
  if (!bridgeConnections.isOnline(board.id)) return 'offline'
  const { token, tokenHash } = newBoardToken()
  const url = bigScreenUrl(board.id, token)
  if (!url) {
    warn('Big screen not opened: set PUBLIC_URL (or BETTER_AUTH_URL) so the page link is absolute', { boardId: board.id })
    return 'no_url'
  }
  if (!(await claimBigScreenToken(db, board.id, tokenHash))) return 'off'
  bigScreen.revoke(board.id)
  if (bridgeConnections.send(board.id, { kind: 'bigscreen.open', data: { url } })) return 'ok'
  await clearBigScreenToken(db, board.id, tokenHash)
  return 'offline'
}

/** Drops the board's token, cuts its open token sockets and has the helper close the window (if the bridge is away, the window stays but can no longer sign in). */
export async function stopBigScreen(db: Kysely<Database>, boardId: string, bigScreen: Revoker, code?: WsCloseCode): Promise<void> {
  await clearBigScreenToken(db, boardId)
  bigScreen.revoke(boardId, code)
  bridgeConnections.send(boardId, { kind: 'bigscreen.close', data: {} })
}

/** The helper started on a board: open the screen when the board's mode is auto (quietly skipped otherwise). */
export async function autoOpenBigScreen(db: Kysely<Database>, boardId: string, bigScreen: Revoker, warn: Warn): Promise<void> {
  const board = await getBoardById(db, boardId)
  if (board?.big_screen_mode === 'auto') await openBigScreen(db, board, bigScreen, warn)
}
