// What a game gave a user that their friends see on Home. Pure: the writers in db/queries.ts
// (finishGameSession) and db/ranked.ts (recordRankedResult) call these inside their transactions.

import type { ActivityInsert } from '../db/activity.js'
import type { RankedMode } from '../shared/ranked.js'

export type FinishedSeat = { userId: string | null; stats: Record<string, number>; forfeited: boolean }

// X01 leaves a key out of a seat's stats when there is nothing to count, whatever the Record type says
const counted = (n: number | undefined): boolean => n !== undefined && n > 0

/**
 * 180s and ton-plus outs of an X01 game's seats; a guest or bot seat (no account) has none. A game
 * anyone left by forfeit is not the game they were told about: it has none at all.
 */
export function finishEvents(gameId: string, mode: string, seats: FinishedSeat[], at: Date): ActivityInsert[] {
  if (mode !== 'x01' || seats.some(s => s.forfeited)) return []
  return seats.flatMap(({ userId, stats }) => {
    if (userId === null) return []
    const events: ActivityInsert[] = []
    if (counted(stats.count180)) events.push({ userId, gameId, kind: 'one_eighty', payload: { count: stats.count180 }, at })
    if (counted(stats.tonOuts)) {
      events.push({ userId, gameId, kind: 'ton_out', payload: { count: stats.tonOuts, best: stats.bestCheckout }, at })
    }
    return events
  })
}

/**
 * A climb to a higher stage. A placing player (no held stage yet) being shown their first stage
 * did not climb, so that is not an event.
 */
export function rankUpEvent(
  gameId: string,
  mode: RankedMode,
  userId: string,
  before: number | null,
  after: number | null,
  at: Date,
): ActivityInsert | null {
  if (before === null || after === null || after <= before) return null
  return { userId, gameId, kind: 'rank_up', payload: { mode, rankIndex: after }, at }
}
