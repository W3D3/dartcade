// Text for the Boards page: versions, hosts, dates, and the tablet's Selected bar.
import type { Board } from './api'

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
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Under the selected board's name on tablets: "Bridge v0.4.2 · connected · paired 12 Aug 2026". */
export function selectedLine(b: Board): string {
  const version = fmtVersion(b.bridgeVersion)
  const bridge = `Bridge ${version ? `${version} · ` : ''}${b.online ? 'connected' : 'offline'}`
  return `${bridge} · paired ${fmtDate(b.createdAt)}`
}
