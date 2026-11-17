// What a deleted account leaves behind in tournaments (run before its row goes, see auth/cleanup.ts):
// its entries are withdrawn the way the player would, and the tournaments it owns pass to the
// longest co-organizer or, with none, are cancelled (a draft is deleted).
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { deleteDraft, moveTournament, withdrawSolo } from './tournaments.js'

export type LeftEntry = { tournamentId: string; entryId: string; running: boolean }

const UNFINISHED = ['draft', 'open', 'check_in', 'running'] as const

/**
 * Withdraws every entry of an online tournament that `userId` plays in or captains. A team loses the
 * whole entry. In-person spots are the organizers' to manage, so they stay. The caller tells the
 * service about the running ones (`TournamentService.withdrawn`).
 */
export async function withdrawEntriesOf(db: Kysely<Database>, userId: string): Promise<LeftEntry[]> {
  const tournaments = await db
    .selectFrom('tournaments as t')
    .select(['t.id', 't.status'])
    .where('t.play', '=', 'online')
    .where('t.status', 'in', ['open', 'check_in', 'running'])
    .where(eb =>
      eb.or([
        eb('t.id', 'in', eb.selectFrom('tournament_players').select('tournament_id').where('user_id', '=', userId)),
        eb('t.id', 'in', eb.selectFrom('tournament_entries').select('tournament_id').where('registered_by_user_id', '=', userId)),
      ]),
    )
    .execute()
  const left: LeftEntry[] = []
  for (const t of tournaments) {
    const entryId = await withdrawSolo(db, t.id, userId)
    if (entryId !== null) left.push({ tournamentId: t.id, entryId, running: t.status === 'running' })
  }
  return left
}

/** Hands each unfinished tournament `userId` owns to its longest co-organizer, or ends it when there is none. */
export async function handOverTournamentsOf(db: Kysely<Database>, userId: string): Promise<void> {
  const owned = await db
    .selectFrom('tournaments')
    .select('id')
    .where('owner_user_id', '=', userId)
    .where('status', 'in', [...UNFINISHED])
    .execute()
  for (const { id } of owned) {
    const next = await db.transaction().execute(async trx => {
      const co = await trx
        .selectFrom('tournament_organizers')
        .select('user_id')
        .where('tournament_id', '=', id)
        .where('user_id', '<>', userId)
        .orderBy('added_at')
        .orderBy('user_id')
        .forUpdate()
        .executeTakeFirst()
      if (!co) return null
      await trx.deleteFrom('tournament_organizers').where('tournament_id', '=', id).where('user_id', '=', co.user_id).execute()
      await trx.updateTable('tournaments').set({ owner_user_id: co.user_id }).where('id', '=', id).execute()
      return co.user_id
    })
    if (next === null && !(await deleteDraft(db, id))) await moveTournament(db, id, 'cancel')
  }
}
