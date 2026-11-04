// Its own module, free of the model's tables, so the page can use it without loading them.
import type { CoachVisit } from './walk.js'

/** The score a visit started on: its remaining is after it, unchanged on a bust. */
export const visitStart = (v: CoachVisit): number => (v.bust ? v.remaining : v.remaining + v.scored)
