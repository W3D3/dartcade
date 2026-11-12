// Tournaments (migration 066). Status changes go through moveTournament/moveMatch only: each reads
// the status, asks shared/tournaments/state.ts's table where the event leads, and writes it only if
// the row still has the status it read. A refused, raced or repeated move returns null.
import type { Insertable, Kysely, Selectable, SqlBool, Updateable } from 'kysely'
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
import { MAX_ORGANIZERS, MAX_UNFINISHED_TOURNAMENTS } from '../shared/tournaments/setup.js'

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

export type TournamentView = TournamentRow & {
  entries: number
  /** Anyone ever registered (withdrawn too): an online tournament's setup is then locked. */
  has_entries: boolean
  owner_name: string | null
}

function viewQuery(db: Kysely<Database>) {
  return db
    .selectFrom('tournaments as t')
    .leftJoin('user as u', 'u.id', 't.owner_user_id')
    .selectAll('t')
    .select('u.name as owner_name')
    .select(eb => [
      eb
        .selectFrom('tournament_entries as e')
        .whereRef('e.tournament_id', '=', 't.id')
        .where('e.status', '<>', 'withdrawn')
        .select(eb.fn.countAll<string>().as('n'))
        .as('entries'),
      eb.exists(eb.selectFrom('tournament_entries as e').whereRef('e.tournament_id', '=', 't.id').select('e.id')).as('has_entries'),
    ])
}

const toView = <R extends { entries: string | null; has_entries: SqlBool }>(r: R) => ({
  ...r,
  entries: Number(r.entries ?? 0),
  has_entries: Boolean(r.has_entries),
})

export async function getTournament(db: Kysely<Database>, id: string): Promise<TournamentView | undefined> {
  const row = await viewQuery(db).where('t.id', '=', id).executeTakeFirst()
  return row && toView(row)
}

/** Tournaments `userId` owns or co-organizes, drafts included, newest first. */
export async function listOrganizedTournaments(db: Kysely<Database>, userId: string): Promise<TournamentView[]> {
  const rows = await viewQuery(db)
    .where(eb =>
      eb.or([
        eb('t.owner_user_id', '=', userId),
        eb.exists(
          eb
            .selectFrom('tournament_organizers as o')
            .whereRef('o.tournament_id', '=', 't.id')
            .where('o.user_id', '=', userId)
            .select('o.user_id'),
        ),
      ]),
    )
    .orderBy('t.created_at', 'desc')
    .execute()
  return rows.map(toView)
}

export type OrganizerRole = 'owner' | 'organizer'

/** `userId`'s part in organizing the tournament, or null. */
export async function organizerRole(
  db: Kysely<Database>,
  t: Pick<TournamentRow, 'id' | 'owner_user_id'>,
  userId: string,
): Promise<OrganizerRole | null> {
  if (t.owner_user_id === userId) return 'owner'
  const row = await db
    .selectFrom('tournament_organizers')
    .select('user_id')
    .where('tournament_id', '=', t.id)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row ? 'organizer' : null
}

/** Inserts the tournament unless its owner already has the most unfinished ones; false then. */
export async function insertTournamentCapped(
  db: Kysely<Database>,
  values: Insertable<TournamentsTable> & { owner_user_id: string },
): Promise<boolean> {
  return db.transaction().execute(async tx => {
    // Two creates at once by one owner wait here, so both cannot slip under the cap
    await tx.selectFrom('user').select('id').where('id', '=', values.owner_user_id).forUpdate().execute()
    const { n } = await tx
      .selectFrom('tournaments')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('owner_user_id', '=', values.owner_user_id)
      .where('status', 'not in', ['finished', 'cancelled'])
      .executeTakeFirstOrThrow()
    if (Number(n) >= MAX_UNFINISHED_TOURNAMENTS) return false
    await tx.insertInto('tournaments').values(values).execute()
    return true
  })
}

/**
 * Writes `set` if the tournament still has `status` and, with `unregistered`, still nobody
 * registered (the edit lock): false when it moved on meanwhile.
 */
export async function updateTournament(
  db: Kysely<Database>,
  id: string,
  set: Updateable<TournamentsTable>,
  { status, unregistered }: { status: TournamentStatus; unregistered: boolean },
): Promise<boolean> {
  let q = db.updateTable('tournaments').set(set).where('id', '=', id).where('status', '=', status)
  if (unregistered)
    q = q.where(eb => eb.not(eb.exists(eb.selectFrom('tournament_entries').whereRef('tournament_id', '=', 'tournaments.id').select('id'))))
  const res = await q.executeTakeFirst()
  return res.numUpdatedRows > 0n
}

/** Deletes a draft; false when it is not (or no longer) one. */
export async function deleteDraft(db: Kysely<Database>, id: string): Promise<boolean> {
  const res = await db.deleteFrom('tournaments').where('id', '=', id).where('status', '=', 'draft').executeTakeFirst()
  return res.numDeletedRows > 0n
}

/** The one answer to "may this user run this tournament", from their `organizerRole`: its owner or a co-organizer. Every organizer-only route asks it. */
export const canOrganize = (role: OrganizerRole | null): role is OrganizerRole => role !== null

export interface OrganizerRow {
  id: string
  name: string
  role: OrganizerRole
  added_at: Date | null
}

/** The owner first, then the co-organizers by when they were added. */
export async function listOrganizers(db: Kysely<Database>, t: Pick<TournamentRow, 'id' | 'owner_user_id'>): Promise<OrganizerRow[]> {
  const rows = await db
    .selectFrom('tournament_organizers as o')
    .innerJoin('user as u', 'u.id', 'o.user_id')
    .select(['u.id', 'u.name', 'o.added_at'])
    .where('o.tournament_id', '=', t.id)
    .orderBy('o.added_at')
    .orderBy('u.id')
    .execute()
  const owner =
    t.owner_user_id === null
      ? undefined
      : await db.selectFrom('user').select(['id', 'name']).where('id', '=', t.owner_user_id).executeTakeFirst()
  return [
    ...(owner ? [{ ...owner, role: 'owner' as const, added_at: null }] : []),
    ...rows.map(r => ({ ...r, role: 'organizer' as const })),
  ]
}

/** Adds a co-organizer unless they already are one or the tournament has the most co-organizers. */
export async function addOrganizer(db: Kysely<Database>, tournamentId: string, userId: string): Promise<'added' | 'exists' | 'full'> {
  return db.transaction().execute(async tx => {
    // Two adds at once wait here, so both cannot slip under the cap
    await tx.selectFrom('tournaments').select('id').where('id', '=', tournamentId).forUpdate().execute()
    const { n } = await tx
      .selectFrom('tournament_organizers')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('tournament_id', '=', tournamentId)
      .executeTakeFirstOrThrow()
    if (Number(n) >= MAX_ORGANIZERS) return 'full'
    const row = await tx
      .insertInto('tournament_organizers')
      .values({ tournament_id: tournamentId, user_id: userId })
      .onConflict(oc => oc.doNothing())
      .returning('user_id')
      .executeTakeFirst()
    return row ? 'added' : 'exists'
  })
}

/** Removes a co-organizer; false when they were not one. */
export async function removeOrganizer(db: Kysely<Database>, tournamentId: string, userId: string): Promise<boolean> {
  const res = await db
    .deleteFrom('tournament_organizers')
    .where('tournament_id', '=', tournamentId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return res.numDeletedRows > 0n
}
