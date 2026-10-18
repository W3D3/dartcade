const MIN = [0, 4, 0]

/** Bridges from 0.4.0 run wled messages; dev builds always do. */
export function supportsLights(v: string | null | undefined): boolean {
  if (!v) return false
  if (v.startsWith('dev')) return true
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v)
  if (!m) return false
  const parts = m.slice(1).map(Number)
  for (let i = 0; i < 3; i++) if (parts[i] !== MIN[i]) return parts[i] > MIN[i]
  return true
}
