// Paying an official tournament's prizes. Called inside the transaction that finishes it, so a
// finished tournament has always paid; the ledger's unique key makes a repeat change nothing.
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { creditXp } from './progression.js'
import { prizeFor } from '../shared/tournaments/prizes.js'

/** Pays each placed entry's players with an account; returns who was paid (user ids). */
export async function awardPrizes(trx: Kysely<Database>, tournamentId: string, at: Date): Promise<string[]> {
  const t = await trx.selectFrom('tournaments').select(['kind', 'prizes']).where('id', '=', tournamentId).executeTakeFirst()
  if (t?.kind !== 'official' || t.prizes.length === 0) return []
  const rows = await trx
    .selectFrom('tournament_entries as e')
    .innerJoin('tournament_players as p', 'p.entry_id', 'e.id')
    .select(['e.final_place', 'p.user_id'])
    .where('e.tournament_id', '=', tournamentId)
    .where('e.final_place', 'is not', null)
    .where('p.user_id', 'is not', null)
    .execute()
  const paid: string[] = []
  for (const { final_place, user_id } of rows) {
    const prize = prizeFor(t.prizes, final_place ?? 0)
    if (!prize || !user_id) continue
    const title = prize.title ? [{ id: prize.title, source: `tournament:${tournamentId}` }] : []
    const credit = { kind: 'tournament', sourceId: tournamentId, amount: prize.xp, meta: { place: final_place } }
    if (!(await creditXp(trx, user_id, credit, at, title))) continue
    paid.push(user_id)
  }
  return paid
}
