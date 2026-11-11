// Tournaments (migration 066). Status changes go through moveTournament/moveMatch only: each reads
// the status, asks shared/tournaments/state.ts's table where the event leads, and writes it only if
// the row still has the status it read. A refused, raced or repeated move returns null.
import type { Kysely, Selectable, Updateable } from 'kysely'
import type { Database, TournamentMatchesTable, TournamentsTable } from './schema.js'
import {
  OUTCOME_OF,
  nextMatchStatus,
  nextTournamentStatus,
  type FinishingMatchEvent,
  type MatchStatus,
  type TournamentEvent,
  type TournamentStatus,
} from '../shared/tournaments/state.js'

export type TournamentRow = Selectable<TournamentsTable>
export type TournamentMatchRow = Selectable<TournamentMatchesTable>

/** The time column a status stamps when a tournament reaches it. */
const STAMP: Partial<Record<TournamentStatus, 'published_at' | 'started_at' | 'ended_at'>> = {
  open: 'published_at',
  running: 'started_at',
  finished: 'ended_at',
  cancelled: 'ended_at',
}

/** Moves a tournament by `event`; the new status, or null when it is missing or may not move so. */
export async function moveTournament(db: Kysely<Database>, id: string, event: TournamentEvent): Promise<TournamentStatus | null> {
  const row = await db.selectFrom('tournaments').select('status').where('id', '=', id).executeTakeFirst()
  const to = row && nextTournamentStatus(row.status, event)
  if (!row || !to) return null
  const set: Updateable<TournamentsTable> = { status: to }
  const stamp = STAMP[to]
  if (stamp) set[stamp] = new Date()
  const res = await db.updateTable('tournaments').set(set).where('id', '=', id).where('status', '=', row.status).executeTakeFirst()
  return res.numUpdatedRows > 0n ? to : null
}

/** A match move; the events that finish a match carry its result. */
export type MatchMove =
  | { event: 'seat' | 'start' | 'abort' }
  | { event: FinishingMatchEvent; winnerEntryId: string | null; legsA: number; legsB: number }

function matchChanges(move: MatchMove, now: Date): Updateable<TournamentMatchesTable> {
  switch (move.event) {
    case 'seat':
      return { ready_at: now }
    case 'start':
      return { started_at: now }
    case 'abort':
      return { started_at: null }
    default:
      return {
        outcome: OUTCOME_OF[move.event],
        winner_entry_id: move.winnerEntryId,
        legs_a: move.legsA,
        legs_b: move.legsB,
        finished_at: now,
      }
  }
}

/** Moves a match by `move.event`; the new status, or null when it is missing or may not move so. */
export async function moveMatch(db: Kysely<Database>, id: string, move: MatchMove): Promise<MatchStatus | null> {
  const row = await db.selectFrom('tournament_matches').select('status').where('id', '=', id).executeTakeFirst()
  const to = row && nextMatchStatus(row.status, move.event)
  if (!row || !to) return null
  const res = await db
    .updateTable('tournament_matches')
    .set({ status: to, ...matchChanges(move, new Date()) })
    .where('id', '=', id)
    .where('status', '=', row.status)
    .executeTakeFirst()
  return res.numUpdatedRows > 0n ? to : null
}

export type BrowseRow = TournamentRow & { entries: number }

/** Published public tournaments not yet over, soonest first (organizer-started ones last), with their entry count. */
export async function listPublicTournaments(db: Kysely<Database>): Promise<BrowseRow[]> {
  const rows = await db
    .selectFrom('tournaments as t')
    .selectAll('t')
    .select(eb =>
      eb
        .selectFrom('tournament_entries as e')
        .whereRef('e.tournament_id', '=', 't.id')
        .where('e.status', '<>', 'withdrawn')
        .select(eb.fn.countAll<string>().as('n'))
        .as('entries'),
    )
    .where('t.access', '=', 'public')
    .where('t.status', 'in', ['open', 'check_in', 'running'])
    .orderBy(
      eb => eb.ref('t.starts_at'),
      eb => eb.asc().nullsLast(),
    )
    .orderBy('t.created_at')
    .execute()
  return rows.map(r => ({ ...r, entries: Number(r.entries ?? 0) }))
}
