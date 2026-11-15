// Moving a finished game's seat to an account (or back to a guest): the one place that knows what
// else holds the seat's account. Claiming or unlinking a tournament spot and guest claims (a host's invite)
// all go through it. Stats, history and the coach read game_players.user_id; the stored details
// and the coach's build marker keep the old seat, so both are dropped and rebuild on the next read.
// Achievements are counted afterwards by AchievementsService.countGame, once per account and game.
import type { Transaction } from 'kysely'
import type { Database } from './schema.js'

export type SeatFilter = { sessionId: string; seat: number } | { tournamentPlayerId: string }

/** Points the seats at `userId` (null: back to a guest). Returns the games' ids, to be counted. */
export async function handOverSeats(tx: Transaction<Database>, filter: SeatFilter, userId: string | null): Promise<string[]> {
  let update = tx.updateTable('game_players').set({ user_id: userId })
  update =
    'tournamentPlayerId' in filter
      ? update.where('tournament_player_id', '=', filter.tournamentPlayerId)
      : update.where('session_id', '=', filter.sessionId).where('seat', '=', filter.seat)
  const ids = (await update.returning('session_id').execute()).map(s => s.session_id)
  if (ids.length > 0) {
    await tx.deleteFrom('game_details').where('session_id', 'in', ids).execute()
    await tx.deleteFrom('coach_games').where('game_id', 'in', ids).execute()
  }
  return ids
}
