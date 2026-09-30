// Around the Clock: targets are 1–20, 21 = outer bull, 22 = bull; a target outside
// the sequence means the player has finished.

export type AtcCell = { label: string; short: string; state: 'hit' | 'current' | 'todo' }

export function atcTargetLabel(sequence: number[], target: number): string {
  if (!sequence.includes(target)) return '✓'
  return target === 21 ? '25' : target === 22 ? 'Bull' : String(target)
}

export function atcCells(sequence: number[], target: number): AtcCell[] {
  const cur = sequence.indexOf(target)
  return sequence.map((n, i) => ({
    label: n === 22 ? 'Bull' : n === 21 ? '25' : String(n),
    short: n === 22 ? 'B' : n === 21 ? '25' : String(n),
    state: cur === -1 || i < cur ? 'hit' : i === cur ? 'current' : 'todo',
  }))
}

export function atcDone(sequence: number[], target: number): number {
  const i = sequence.indexOf(target)
  return i === -1 ? sequence.length : i
}

/** Board segment for a target (25 = outer bull, 50 = bull), or null when finished or unknown. */
export function atcTargetSegment(sequence: number[], target: number | undefined): number | null {
  if (target === undefined || !sequence.includes(target)) return null
  return target === 21 ? 25 : target === 22 ? 50 : target
}

/** Players on the highest number of targets done; nobody while that is 0. */
export function atcLeaders(hitCounts: number[]): number[] {
  const max = Math.max(0, ...hitCounts)
  return max > 0 ? hitCounts.flatMap((h, i) => (h === max ? [i] : [])) : []
}
