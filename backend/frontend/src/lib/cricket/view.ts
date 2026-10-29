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

/** The marks a dart is worth on the targets (the backend's `marksFor`): its multiplier on a
 *  target, the bullseye 2 however it's reported (50, or a double 25), nothing elsewhere. */
export function dartMarks(segment: { number?: number; multiplier?: number }, targets: readonly number[]): number {
  if (segment.number === 50) return targets.includes(25) ? 2 : 0
  return targets.includes(segment.number ?? 0) ? (segment.multiplier ?? 0) : 0
}

/** One column of the marks table: a player, or a team with its members. `seat` is the seat
 *  whose marks, points and legs the side shows (a team's seats all share them). */
export type CricketSide = { seat: number; seats: number[]; name: string; members: string | null }

export function cricketSides(game: CricketGame, players: { name: string }[]): CricketSide[] {
  if (game.teams)
    return game.teams.map(t => ({
      seat: t.seats[0],
      seats: t.seats,
      name: t.name,
      members: t.seats.map(s => players[s]?.name ?? '').join(' · '),
    }))
  return game.marks.map((_, i) => ({ seat: i, seats: [i], name: players[i]?.name ?? '', members: null }))
}

/** Marks per round (three darts) of these seats, the thrower's open visit included: "2.3". */
export function cricketMpr(game: CricketGame, seats: number[]): string {
  const sum = (xs: number[]) => seats.reduce((n, s) => n + (xs[s] ?? 0), 0)
  const darts = sum(game.dartsThrown) + (seats.includes(game.currentPlayer) ? game.currentVisitDarts.length : 0)
  return (darts ? (sum(game.marksScored) / darts) * 3 : 0).toFixed(1)
}

/** The leg being played: 1 + the legs won so far. */
export function legNumber(game: CricketGame): number {
  const won = game.teams ? game.teams.map(t => t.legs) : game.legs
  return won.reduce((n, l) => n + l, 1)
}
