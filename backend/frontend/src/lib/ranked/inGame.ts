// What a ranked game's snapshot (`ranked`, RankedState in schema/game-ws-v1.json) says to the
// match screen: the stakes, the up seat's clock, a seat that lost its connection, hand entry.
// The clock is the server's: every timestamp is compared with the snapshot's `now`, so a screen
// whose own clock is off still counts down right.
import type { Snapshot } from '$lib/api'
import { clockView, type ClockView } from './clock'
import { rank, type Rank } from '$shared/ranked.js'
import { signedRp } from './view'

export type RankedState = NonNullable<Snapshot['ranked']>

/** "Win +16 · Loss −14"; null while placing (the stakes stay hidden). */
export function stakesLabel(stakes: RankedState['seats'][number]['stakes']): string | null {
  return stakes ? `Win ${signedRp(stakes.win)} · Loss ${signedRp(-stakes.loss)}` : null
}

/** The server's clock minus this one at the moment the snapshot arrived. */
export const clockSkew = (ranked: RankedState): number => Date.parse(ranked.now) - Date.now()

/** The up seat's visit and reserve at `now` (this screen's clock), hidden until close to the limit. */
export function upClock(ranked: RankedState, skew: number, now: number): ClockView {
  // No deadline: no visit clock is running (the bull off, a finished game)
  if (ranked.visitDeadline === null || ranked.forfeitAt === null) return { phase: 'hidden' }
  const server = now + skew
  return clockView({
    visitLeft: (Date.parse(ranked.visitDeadline) - server) / 1000,
    reserveLeft: (Date.parse(ranked.forfeitAt) - server) / 1000,
  })
}

/** The first seat the viewer does not control whose connection is gone: who, and when they forfeit (this screen's clock). */
export function disconnected(ranked: RankedState, mySeats: readonly number[], skew: number): { seat: number; forfeitAt: number } | null {
  for (const [seat, s] of ranked.seats.entries()) {
    if (s.disconnectForfeitAt !== null && !mySeats.includes(seat)) return { seat, forfeitAt: Date.parse(s.disconnectForfeitAt) - skew }
  }
  return null
}

/** A seat's rank and rating for its chip: both null for a guest or bot, a rank-less "Placement" while placing. */
export function seatRank(seat: RankedState['seats'][number]): { rank: Rank | null; rating: number | null } | null {
  if (seat.rating === null && seat.rankIndex === null && seat.placement === null) return null
  return { rank: seat.rankIndex === null ? null : rank(seat.rankIndex), rating: seat.rating }
}
