// Asking a board's bridge to make a Board Manager call (the backend never calls a board itself), and
// Board Manager's /api/state as we pass it on. Shared by the REST routes and the big screen service.
import { z } from 'zod'
import { bridgeConnections, type BmRequest, type BmResponse } from '../bridge-gw/connections.js'

/** How long the bridge may take to answer a Board Manager call (its own HTTP timeout is 10 s). */
export const BM_TIMEOUT_MS = 12_000

/** Board Manager's /api/state, as far as we pass it on: each field falls back on its own. */
export const BmStateSchema = z
  .object({
    status: z.string().nullable().catch(null).default(null),
    running: z.boolean().catch(false).default(false),
    event: z.string().nullable().catch(null).default(null),
  })
  .catch({ status: null, running: false, event: null })

export type BmAnswer = { ok: true; res: BmResponse & { status: number } } | { ok: false; code: 502 | 503; error: string }

/** Has the board's bridge make a Board Manager call; a failure says which HTTP code and text to answer with. */
export async function askBoard(id: string, req: BmRequest, timeoutMs: number): Promise<BmAnswer> {
  if (!bridgeConnections.isOnline(id)) return { ok: false, code: 503, error: 'board offline' }
  const res = await bridgeConnections.request(id, req, timeoutMs)
  if (!res) return { ok: false, code: 503, error: 'board did not answer (update its bridge)' }
  if (res.status === undefined) {
    // Kept to the log: the bridge's error names hosts on the board's network
    console.warn('Board Manager call failed', { boardId: id, op: req.op, error: res.error })
    return { ok: false, code: 502, error: 'Board Manager request failed' }
  }
  return { ok: true, res: { ...res, status: res.status } }
}

/** What Board Manager answered to a `state` call; null when it did not answer 2xx. */
export const stateOf = (res: { status: number; state?: unknown }) =>
  res.status >= 200 && res.status < 300 ? BmStateSchema.parse(res.state) : null

/** The board's Board Manager status ("Running", "Throw", "Takeout"...); null when the board cannot say. */
export async function boardStatus(id: string, timeoutMs = BM_TIMEOUT_MS): Promise<string | null> {
  const answer = await askBoard(id, { op: 'state' }, timeoutMs)
  return answer.ok ? (stateOf(answer.res)?.status ?? null) : null
}
