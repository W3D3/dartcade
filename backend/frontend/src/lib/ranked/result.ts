// What the ranked result screen says about the rating (MM-Result board). The match's own result
// (RP change, rank before and after) comes with the game's snapshot, the extra cards from the profile.
import type { components } from '$lib/api/schema'
import { nextStage, rank, type Rank } from '$shared/ranked.js'
import { fmtAvg } from '$lib/playerStats'
import { record } from './view'
import { seatRank, type RankedState } from './inGame'
import { signedRp } from './view'

type RankedProfile = components['schemas']['RankedProfile']

export type RankedOutcome = {
  mode: RankedState['mode']
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
  /** Placement matches played out of the total, counting this one; null once placed. */
  placing: { played: number; of: number } | null
  /** Progress to the next stage, 0 to 100, and the line under the bar; null while placing or at the top. */
  progress: { pct: number; line: string } | null
  /** The other side's seat and rank, for "[Gold I · 1 301 RP]" under their name (1v1 only). */
  opponent: { seat: number; rank: Rank | null; rating: number | null } | null
}

/** The viewer's seat's result; null until the server has recorded it (and for a guest or an unrated match). */
export function rankedOutcome(ranked: RankedState, seatIndex: number, won: boolean): RankedOutcome | null {
  const seat = ranked.seats.at(seatIndex)
  const result = seat?.result
  if (!result) return null
  const { change, rankIndexBefore, rankIndexAfter } = result
  const before = change === null || seat.rating === null ? null : seat.rating
  const after = before === null || change === null ? null : before + change
  const rankAfter = rankIndexAfter === null ? null : rank(rankIndexAfter)
  const rankBefore = rankIndexBefore === null ? null : rank(rankIndexBefore)
  const moved =
    rankAfter && rankBefore && rankAfter.index !== rankBefore.index ? (rankAfter.index > rankBefore.index ? 'promoted' : 'demoted') : null
  const next = rankAfter && after !== null ? nextStage(rankAfter.index, after) : null
  const otherSeat = ranked.seats.length === 2 ? 1 - seatIndex : -1
  const other = ranked.seats[otherSeat] ? seatRank(ranked.seats[otherSeat]) : null
  return {
    mode: ranked.mode,
    won,
    change: change === null ? null : `${signedRp(change)} RP`,
    before,
    after,
    rankBefore,
    rankAfter,
    moved,
    placing: rankIndexAfter === null && seat.placement ? { played: seat.placement.played + 1, of: seat.placement.of } : null,
    progress:
      rankAfter && after !== null && next
        ? {
            pct: Math.max(0, Math.min(100, Math.round(((after - rankAfter.min) / (next.rank.min - rankAfter.min)) * 100))),
            line: `${next.missing} RP to ${next.rank.name}`,
          }
        : null,
    opponent: other && { seat: otherSeat, ...other },
  }
}

export type RankedExtras = { onlineAverage: string; onlineLine: string; record: string; recordLine: string }

/** The Online average and Record cards, from the profile (after the match is recorded). */
export function rankedExtras(profile: RankedProfile): RankedExtras {
  const rec = record(profile.ratings)
  return { onlineAverage: fmtAvg(profile.onlineAverage), onlineLine: 'Last 20 ranked matches', record: rec.score, recordLine: rec.line }
}
