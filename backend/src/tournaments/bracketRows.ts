// A running tournament's stored rows read as its bracket (shared/tournaments/run.ts): the runner
// moves the bracket on from it, the live view shows it.
import type { TournamentMatchRow, TournamentRow } from '../db/tournaments.js'
import type { RunEntry } from '../db/tournamentRun.js'
import { BRACKET_ORDER, type Match, type MatchResult } from '../shared/tournaments/bracket.js'
import { replay, type Decided, type DrawSetup, type MatchPlace } from '../shared/tournaments/run.js'

export const setupOf = (t: TournamentRow): DrawSetup => ({ format: t.format, settings: t.settings })
export const placeOf = (r: TournamentMatchRow): MatchPlace => ({ bracket: r.bracket, group: r.group_no, round: r.round, index: r.slot })

// Earlier in the bracket first: a round robin's later rounds wait for the earlier ones
export const before = (a: TournamentMatchRow, b: TournamentMatchRow) =>
  BRACKET_ORDER[a.bracket] - BRACKET_ORDER[b.bracket] || (a.group_no ?? 0) - (b.group_no ?? 0) || a.round - b.round || a.slot - b.slot

/** A finished row as the bracket takes it: legs that finish the match are a played result, anything else a walkover. */
function decidedOf(r: TournamentMatchRow): Decided {
  const winner = r.winner_entry_id === r.entry_a_id ? 0 : 1
  const legs = [r.legs_a, r.legs_b] as const
  const played = r.outcome !== 'walkover' && legs[winner] === r.first_to && legs[1 - winner] < r.first_to
  const result: MatchResult = played ? { outcome: 'played', winner, legs } : { outcome: 'walkover', winner }
  return { ...placeOf(r), result }
}

/** The drawn entries in seed order (seed 1 first). */
export const seededOf = (entries: readonly RunEntry[]): string[] =>
  entries
    .filter(e => e.seed !== null)
    .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
    .map(e => e.id)

/** The bracket the stored results lead to: the draw again, then each decided match in the order it finished. */
export function bracketOf(t: TournamentRow, seeded: readonly string[], rows: readonly TournamentMatchRow[]): Match[] {
  const decided = rows
    .filter(r => r.status === 'finished' && r.outcome !== 'bye')
    .sort((a, b) => (a.finished_at?.getTime() ?? 0) - (b.finished_at?.getTime() ?? 0) || before(a, b))
    .map(decidedOf)
  return replay(setupOf(t), seeded, decided)
}
