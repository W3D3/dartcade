import type { BoardMotion } from './api'

export type Motion = BoardMotion['motion']

/** The diagnostics pill's words: the state (partial or full for a takeout), or unknown for an old or offline bridge. */
export function motionLabel(motion: Motion): string {
  if (!motion) return 'Unknown'
  if (motion.state === 'takeout') return motion.takeout ? `Takeout (${motion.takeout})` : 'Takeout'
  return motion.state[0].toUpperCase() + motion.state.slice(1)
}

/** "for 12 s" / "for 3 min" / "for 2 h" since the state began; empty when unknown. */
export function motionSince(motion: Motion, now: number): string {
  if (!motion) return ''
  const s = Math.max(0, Math.round((now - Date.parse(motion.since)) / 1000))
  if (s < 60) return `for ${s} s`
  if (s < 3600) return `for ${Math.floor(s / 60)} min`
  return `for ${Math.floor(s / 3600)} h`
}
