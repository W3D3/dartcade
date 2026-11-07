// What a ranked game's snapshot (`ranked`, RankedState in schema/game-ws-v1.json) says to the
// match screen: the stakes, the up seat's clock, a seat that lost its connection, hand entry.
// The clock is the server's: every timestamp is compared with the snapshot's `now`, so a screen
// whose own clock is off still counts down right.
import type { Snapshot } from '$lib/api'
import { clockView, type ClockInput, type ClockView } from './clock'
import { rank, type Rank } from '$shared/ranked.js'
import { signedRp } from './view'

export type RankedState = NonNullable<Snapshot['ranked']>

/** "Win +16 · Loss −14"; null while placing (the stakes stay hidden). */
export function stakesLabel(stakes: RankedState['seats'][number]['stakes']): string | null {
  return stakes ? `Win ${signedRp(stakes.win)} · Loss ${signedRp(-stakes.loss)}` : null
}

/** The server's clock minus this one at the moment the snapshot arrived. */
export const clockSkew = (ranked: RankedState): number => Date.parse(ranked.now) - Date.now()

/** The up seat's visit and reserve left at `now` (this screen's clock); null while no visit clock runs (the bull off, a finished game). */
export function upLeft(ranked: RankedState, skew: number, now: number): ClockInput | null {
  const { visitDeadline, forfeitAt } = ranked
  if (visitDeadline === null || forfeitAt === null) return null
  const server = now + skew
  return { visitLeft: (Date.parse(visitDeadline) - server) / 1000, reserveLeft: (Date.parse(forfeitAt) - server) / 1000 }
}

/** The up seat's visit and reserve at `now`, hidden until close to the limit. */
export function upClock(ranked: RankedState, skew: number, now: number): ClockView {
  const left = upLeft(ranked, skew, now)
  return left ? clockView(left) : { phase: 'hidden' }
}

/** The first seat the viewer does not control whose connection is gone: who, and when they forfeit (this screen's clock). */
export function disconnected(ranked: RankedState, mySeats: readonly number[], skew: number): { seat: number; forfeitAt: number } | null {
  for (const [seat, s] of ranked.seats.entries()) {
    if (s.disconnectForfeitAt !== null && !mySeats.includes(seat)) return { seat, forfeitAt: Date.parse(s.disconnectForfeitAt) - skew }
  }
  return null
}

/** A seat's rank and rating for its chip. */
export type SeatRank = { rank: Rank | null; rating: number | null }

/** Null for a guest or bot; a rank-less "Placement" chip while placing. */
export function seatRank(seat: RankedState['seats'][number]): SeatRank | null {
  if (seat.rating === null && seat.rankIndex === null && seat.placement === null) return null
  return { rank: seat.rankIndex === null ? null : rank(seat.rankIndex), rating: seat.rating }
}
