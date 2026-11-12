// The words and the calendar behind the My tournaments tab (shared with the SPA): the season, a
// finished tournament's place and where a match sits in its bracket. Pure.
import { roundName, type Bracket } from './bracket.js'
import type { TournamentFormat } from './setup.js'

/** "This season" is the calendar quarter until seasons exist (tracking issue #596, Q2). */
export function quarterOf(now: Date): { label: string; start: Date } {
  const q = Math.floor(now.getUTCMonth() / 3)
  return { label: `Q${q + 1} ${now.getUTCFullYear()}`, start: new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)) }
}

const ordinal = (n: number): string => {
  const rest = n % 100
  const suffix = rest >= 11 && rest <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')
  return `${n}${suffix}`
}

/**
 * A final place in words: 1st to 3rd, and in a single elimination (where everyone knocked out in
 * the same round shares a place) the round they went out in: 5th is QF, 9th Last 16.
 */
export function placeLabel(place: number, format: TournamentFormat): string {
  if (place <= 3 || format !== 'single_elimination') return ordinal(place)
  // place - 1 entries got further, and as many again went out with this one
  const left = 2 * (place - 1)
  return left === 8 ? 'QF' : Number.isInteger(Math.log2(left)) ? `Last ${left}` : ordinal(place)
}

/** "Quarter-final", "Final", "Group 2", "Lower bracket, round 1" for a match of the bracket. */
export function matchTitle(m: { bracket: Bracket; group: number | null; round: number }, mainRounds: number): string {
  switch (m.bracket) {
    case 'group':
      return `Group ${m.group}`
    case 'lower':
      return `Lower bracket, round ${m.round}`
    case 'final':
      return 'Grand final'
    case 'main':
      // roundName names a round of many matches ("Quarter-finals"); this one is a single match
      return roundName(m.round, mainRounds).name.replace(/finals$/, 'final')
  }
}
