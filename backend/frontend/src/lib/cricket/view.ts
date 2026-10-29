// Pure view helpers for Cricket: the header meta line, a mark's glyph, a target's label, and
// which state the board highlights a target in for the thrower. Fed by the CricketGame
// snapshot; see docs/superpowers/specs/2026-10-25-cricket-design.md.
import type { CricketGame } from '../api/game-ws'
import { cricketRules } from '../gameViews/meta.js'
import { plural } from '../fmt.js'

/** "2 players · Cut-throat · First to 3 · Round 4". */
export function cricketMeta(game: CricketGame, players: number): string {
  return `${plural(players, 'player')} · ${cricketRules(game.config)} · Round ${game.round}`
}

/** '' (0 marks) | '/' (1) | 'X' (2) | '⊗' (3 or more, closed). */
export function markGlyph(marks: number): '' | '/' | 'X' | '⊗' {
  if (marks <= 0) return ''
  if (marks === 1) return '/'
  if (marks === 2) return 'X'
  return '⊗'
}

/** "20" … "15", "Bull" for the outer/inner bull target (25). */
export function targetLabel(target: number): string {
  return target === 25 ? 'Bull' : String(target)
}

// Whether two seats are on the same team; without teams, only a seat is "on its own team".
function sameTeam(game: CricketGame, a: number, b: number): boolean {
  if (!game.teams) return a === b
  return game.teams.some(t => t.seats.includes(a) && t.seats.includes(b))
}

/**
 * Which state the board highlights a target in, for the thrower's seat: 'closed' once every
 * team opened it; 'score' while it's scorable and the seat is on the throwing team; 'need'
 * while the seat's own marks aren't at 3 yet; 'done' once they are, but there's nothing left
 * to score (closed for every other team, or not this seat's turn).
 */
export function targetState(game: CricketGame, seat: number, i: number): 'need' | 'score' | 'closed' | 'done' {
  if (game.closed[i]) return 'closed'
  if (game.scorable[i] && sameTeam(game, seat, game.currentPlayer)) return 'score'
  return game.marks[seat][i] < 3 ? 'need' : 'done'
}
