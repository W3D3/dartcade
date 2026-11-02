// The coach's review of one player's finished X01 game: strategy notes, execution stats, miss
// tendencies. Pure; the frontend runs it on the game's stored detail.
import { strategyNotes, type CoachNote } from './notes.js'
import { executionStats, missTendencies, type CoachStats, type Tendency } from './stats.js'
import { throwsOf, type CoachLeg } from './walk.js'

export type { CoachNote } from './notes.js'
export type { CoachStats, DoubleStat, Tendency } from './stats.js'
export type { CoachLeg } from './walk.js'
export { NOTE_THRESHOLD } from './notes.js'
export { LANDING_LEVEL } from './landing.gen.js'

export type CoachReport = { notes: CoachNote[]; stats: CoachStats; tendencies: Tendency[] }

export function coachGame(legs: readonly CoachLeg[], seat: number, startScore: number): CoachReport {
  const throws = throwsOf(legs, seat, startScore)
  return { notes: strategyNotes(throws), stats: executionStats(throws), tendencies: missTendencies(throws) }
}
