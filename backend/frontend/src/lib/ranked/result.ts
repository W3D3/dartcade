// What the ranked result screen says about the rating (MM-Result board): the RP change, the rank
// before and after, and how far a placing player is. Built from the profile the server serves
// once the game is recorded (`GET /api/ranked/me`).
import type { components } from '$lib/api/schema'
import { PLACEMENT_MATCHES, rank, rankIndexFor, type Rank } from '$shared/ranked.js'
import { rankProgress } from '$lib/home/view'
import { signedRp, type RankedGame, type RankedRating } from './view'

type RankedProfile = components['schemas']['RankedProfile']

export type RankedOutcome = {
  mode: RankedGame['mode']
  won: boolean
  /** "+17 RP" / "−14 RP"; null for a placement match, whose RP stay hidden. */
  change: string | null
  /** RP before and after; null while placing. */
  before: number | null
  after: number | null
  rankBefore: Rank | null
  rankAfter: Rank | null
  /** The stage went up or down with this game; null when it did not. */
  moved: 'promoted' | 'demoted' | null
  /** Placement matches played out of five; null once placed. */
  placing: { played: number; of: number } | null
  /** Progress to the next stage, 0 to 100, and the line under the bar; null while placing or at the top. */
  progress: { pct: number; line: string } | null
  /** "4 wins in a row" once it is two or more of either kind. */
  streak: string | null
  /** Wins and losses over the mode. */
  record: { score: string; line: string }
  opponentRating: number | null
}

/** The game's line in the profile's recent list, and its rating; null until the server has recorded it. */
export function rankedOutcome(profile: RankedProfile, sessionId: string): RankedOutcome | null {
  const game = profile.recent.find(g => g.sessionId === sessionId)
  const rating = game && profile.ratings.find(r => r.mode === game.mode)
  if (!game || !rating) return null
  const placed = rating.rankIndex !== null && rating.rating !== null
  const after = placed ? rating.rating : null
  const before = after !== null && game.change !== null ? after - game.change : null
  const rankAfter = rating.rankIndex === null ? null : rank(rating.rankIndex)
  // Reconstructed from the rating before; a demotion buffer can hold you above it, never below
  const rankBefore = before === null ? null : rank(rankIndexFor(before))
  const moved =
    rankAfter && rankBefore && rankAfter.index !== rankBefore.index ? (rankAfter.index > rankBefore.index ? 'promoted' : 'demoted') : null
  const bar = rankProgress(rating)
  return {
    mode: game.mode,
    won: game.won,
    change: game.change === null ? null : `${signedRp(game.change)} RP`,
    before,
    after,
    rankBefore,
    rankAfter,
    moved,
    placing: placed ? null : { played: rating.matches, of: PLACEMENT_MATCHES },
    progress: bar && { pct: bar.pct, line: bar.line },
    streak: streakLine(rating),
    record: {
      score: `${rating.wins}–${rating.matches - rating.wins}`,
      line: `${Math.floor((rating.wins / Math.max(1, rating.matches)) * 100)}% won`,
    },
    opponentRating: game.opponents.length === 1 ? game.opponents[0].rating : null,
  }
}

function streakLine(r: RankedRating): string | null {
  if (r.streak >= 2) return `${r.streak} wins in a row`
  if (r.streak <= -2) return `${-r.streak} losses in a row`
  return null
}
