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

const PHASE_TEXT = {
  requested: 'Asking the bridge',
  downloading: 'Downloading',
  verifying: 'Verifying',
  installing: 'Installing',
  restarting: 'Restarting',
} as const

/** What the Bridge row says about updating it, and whether it offers the Update bridge button. */
export type BridgeUpdateView =
  | { kind: 'none' }
  | { kind: 'busy'; text: string }
  | { kind: 'done'; text: string }
  /** Failed, with nothing (left) to update to, e.g. while the bridge is offline */
  | { kind: 'failed'; text: string }
  | { kind: 'available'; version: string; canUpdate: boolean; error: string | null }

export function bridgeUpdateView(b: Board): BridgeUpdateView {
  const { available, updatable, status } = b.bridgeUpdate
  if (status && status.phase !== 'done' && status.phase !== 'failed')
    return { kind: 'busy', text: `${PHASE_TEXT[status.phase]} ${status.version}…` }
  if (status?.phase === 'done' && !available) return { kind: 'done', text: `Updated to ${status.version}` }
  const error = status?.phase === 'failed' ? `Update to ${status.version} failed: ${status.error ?? 'unknown error'}` : null
  if (!available) return error ? { kind: 'failed', text: error } : { kind: 'none' }
  return { kind: 'available', version: available, canUpdate: b.online && updatable, error }
}
