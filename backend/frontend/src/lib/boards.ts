// Text for the Boards page: versions, hosts, dates, and the tablet's Selected bar.
import type { Board } from './api'
import type { BoardStatusMessage } from './api/lobby-ws'
import { dayMonth } from './fmt.js'

/** "0.4.2" / "v0.4.2" → "v0.4.2"; non-semver builds (e.g. "dev") as-is. */
export function fmtVersion(v?: string | null): string | null {
  if (!v) return null
  return /^v?\d/.test(v) ? `v${v.replace(/^v/, '')}` : v
}

/** host:port of the Board Manager, falling back to the bare IP. */
export function bmHost(b: Board): string {
  try {
    if (b.bmUrl) return new URL(b.bmUrl).host
  } catch {
    /* fall through */
  }
  return b.ip ?? ''
}

/** "12 Aug 2026", or "—" when unknown. */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : `${dayMonth(d)} ${d.getFullYear()}`
}

/** Under the selected board's name on tablets: "Bridge v0.4.2 · connected · paired 12 Aug 2026". */
export function selectedLine(b: Board): string {
  const version = fmtVersion(b.bridgeVersion)
  const bridge = `Bridge ${version ? `${version} · ` : ''}${b.online ? 'connected' : 'offline'}`
  return `${bridge} · paired ${fmtDate(b.createdAt)}`
}

/**
 * A board.status push applied to the list. 'refetch' when the list can't be patched: a board
 * it doesn't have yet, or one that came online (its versions and Board Manager URL are new).
 */
export function applyBoardStatus(boards: Board[], msg: Pick<BoardStatusMessage, 'boardId' | 'online'>): Board[] | 'refetch' {
  const board = boards.find(b => b.id === msg.boardId)
  if (!board || msg.online) return 'refetch'
  return boards.map(b => (b.id === msg.boardId ? { ...b, online: false } : b))
}
