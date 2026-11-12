// Tournaments (migration 066). Status changes go through moveTournament/moveMatch only: each reads
// the status, asks shared/tournaments/state.ts's table where the event leads, and writes it only if
// the row still has the status it read. A refused, raced or repeated move returns null.
import { randomUUID } from 'node:crypto'
import { sql, type ExpressionBuilder, type Insertable, type Kysely, type Selectable, type SqlBool, type Updateable } from 'kysely'
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
import { canWithdraw, registrationState, type RegistrationState } from '../shared/tournaments/registration.js'
import { NO_FORM, entryEligibility, keepsSpot, type Eligibility } from '../shared/tournaments/avgLimit.js'
import { PROFILE_AVERAGE_DAYS } from '../shared/avgClass.js'
import { toAvatar, type Avatar } from './users.js'
import { x01Forms } from './ranked.js'
import { groupBy } from '../util/groupBy.js'
import { areFriends } from './friends.js'

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
export async function moveTournament(
  db: Kysely<Database>,
  id: string,
  event: TournamentEvent,
  at = new Date(),
): Promise<TournamentStatus | null> {
  const row = await db.selectFrom('tournaments').select('status').where('id', '=', id).executeTakeFirst()
  const to = row && nextTournamentStatus(row.status, event)
  if (!row || !to) return null
  const set: Updateable<TournamentsTable> = { status: to }
  const stamp = STAMP[to]
  if (stamp) set[stamp] = at
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

/** Moves a match by `move.event` at `at`; the new status, or null when it is missing or may not move so. */
export async function moveMatch(db: Kysely<Database>, id: string, move: MatchMove, at = new Date()): Promise<MatchStatus | null> {
  const row = await db.selectFrom('tournament_matches').select('status').where('id', '=', id).executeTakeFirst()
  const to = row && nextMatchStatus(row.status, move.event)
  if (!row || !to) return null
  const res = await db
    .updateTable('tournament_matches')
    .set({ status: to, ...matchChanges(move, at) })
    .where('id', '=', id)
    .where('status', '=', row.status)
    .executeTakeFirst()
  return res.numUpdatedRows > 0n ? to : null
}

export type TournamentView = TournamentRow & {
  entries: number
  /** Anyone ever registered (withdrawn too): an online tournament's setup is then locked. */
  has_entries: boolean
  owner_name: string | null
}

export function viewQuery(db: Kysely<Database>) {
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

export const toView = <R extends { entries: string | null; has_entries: SqlBool }>(r: R) => ({
  ...r,
  entries: Number(r.entries ?? 0),
  has_entries: Boolean(r.has_entries),
})

export type BrowseRow = TournamentView & { registered: boolean }

type ByTournament = ExpressionBuilder<Database & { t: TournamentsTable }, 't'>

/** `userId` holds a spot that is not withdrawn. */
const registeredBy = (eb: ByTournament, userId: string) =>
  eb.exists(
    eb
      .selectFrom('tournament_players as p')
      .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
      .whereRef('p.tournament_id', '=', 't.id')
      .where('p.user_id', '=', userId)
      .where('e.status', '<>', 'withdrawn')
      .select('p.id'),
  )

/** An accepted friendship between `userId` and the account in `other` (a column). */
const friendsWith = (userId: string, other: string) =>
  sql<boolean>`EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND (
    (f.requester_id = ${userId} AND f.addressee_id = ${sql.ref(other)}) OR (f.addressee_id = ${userId} AND f.requester_id = ${sql.ref(other)})))`

/**
 * Published tournaments not yet over that `userId` may browse, soonest first (organizer-started
 * ones last): public ones, friends-only ones of a friend, and any they hold a spot in or organize
 * (an invite link's stays hidden from everyone else).
 */
export async function listBrowseTournaments(db: Kysely<Database>, userId: string): Promise<BrowseRow[]> {
  const rows = await viewQuery(db)
    .select(eb => registeredBy(eb, userId).as('registered'))
    .where('t.status', 'in', ['open', 'check_in', 'running'])
    .where(eb =>
      eb.or([
        eb('t.access', '=', 'public'),
        eb('t.owner_user_id', '=', userId),
        eb.and([eb('t.access', '=', 'friends'), friendsWith(userId, 't.owner_user_id')]),
        registeredBy(eb, userId),
        eb.exists(
          eb
            .selectFrom('tournament_organizers as o')
            .whereRef('o.tournament_id', '=', 't.id')
            .where('o.user_id', '=', userId)
            .select('o.user_id'),
        ),
      ]),
    )
    .orderBy(
      eb => eb.ref('t.starts_at'),
      eb => eb.asc().nullsLast(),
    )
    .orderBy('t.created_at')
    .execute()
  return rows.map(r => ({ ...toView(r), registered: Boolean(r.registered) }))
}

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

/**
 * Whether `userId` may see the tournament, with their organizer role; null for a draft, a
 * friends-only one of someone not their friend, or an invite link's they hold no spot in and came
 * to without its `code`. The API, the live socket and Watch all ask this.
 */
export async function viewerRole(
  db: Kysely<Database>,
  t: Pick<TournamentRow, 'id' | 'owner_user_id' | 'status' | 'access' | 'invite_code'>,
  userId: string,
  code?: string,
): Promise<{ role: OrganizerRole | null } | null> {
  const role = await organizerRole(db, t, userId)
  if (role) return { role }
  if (t.status === 'draft') return null
  if (t.access === 'friends' && !(t.owner_user_id !== null && (await areFriends(db, t.owner_user_id, userId)))) return null
  if (t.access === 'invite' && !(code !== undefined && code.toUpperCase() === t.invite_code) && !(await isRegistered(db, t.id, userId)))
    return null
  return { role: null }
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

export async function getTournamentByCode(db: Kysely<Database>, code: string): Promise<TournamentView | undefined> {
  const row = await viewQuery(db).where('t.invite_code', '=', code).executeTakeFirst()
  return row && toView(row)
}

/** The status of `userId`'s spot when it is not withdrawn, else null. */
export async function spotStatus(
  db: Kysely<Database>,
  tournamentId: string,
  userId: string,
): Promise<'pending' | 'registered' | 'checked_in' | null> {
  const row = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select('e.status')
    .where('p.tournament_id', '=', tournamentId)
    .where('p.user_id', '=', userId)
    .where('e.status', '<>', 'withdrawn')
    .executeTakeFirst()
  return row?.status === undefined || row.status === 'withdrawn' ? null : row.status
}

/** `userId` holds a spot that is not withdrawn. */
export async function isRegistered(db: Kysely<Database>, tournamentId: string, userId: string): Promise<boolean> {
  return (await spotStatus(db, tournamentId, userId)) !== null
}

/** `userId` has paired a board: online tournaments need one unless manual scoring is allowed. */
export async function hasPairedBoard(db: Kysely<Database>, userId: string): Promise<boolean> {
  return (await db.selectFrom('boards').select('id').where('owner_user_id', '=', userId).executeTakeFirst()) !== undefined
}

/** `userId`'s friends who hold a spot in the tournament, by name. */
export async function friendsIn(
  db: Kysely<Database>,
  tournamentId: string,
  userId: string,
): Promise<{ id: string; name: string; avatar: Avatar }[]> {
  const rows = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .innerJoin('user as u', 'u.id', 'p.user_id')
    .select(['u.id', 'u.name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'])
    .where('p.tournament_id', '=', tournamentId)
    .where('e.status', '<>', 'withdrawn')
    .where(friendsWith(userId, 'u.id'))
    .orderBy(eb => eb.fn('lower', ['u.name']))
    .orderBy('u.id')
    .execute()
  return rows.map(r => ({ id: r.id, name: r.name, avatar: toAvatar(r) }))
}

/**
 * Registers `user` alone for the tournament, or takes back the spot they withdrew from. Checks
 * the rule with the tournament row locked, so two registrations cannot both take the last spot.
 * Returns what stood in the way, or `open` once registered.
 */
export async function registerSolo(
  db: Kysely<Database>,
  tournamentId: string,
  user: { id: string; name: string; hasBoard: boolean; eligible: boolean },
  now: Date,
): Promise<RegistrationState | null> {
  return db.transaction().execute(async tx => {
    const t = await tx.selectFrom('tournaments').selectAll().where('id', '=', tournamentId).forUpdate().executeTakeFirst()
    if (!t) return null
    const mine = await tx
      .selectFrom('tournament_players as p')
      .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
      .select(['e.id', 'e.status'])
      .where('p.tournament_id', '=', tournamentId)
      .where('p.user_id', '=', user.id)
      .executeTakeFirst()
    const { n } = await tx
      .selectFrom('tournament_entries')
      .select(eb => eb.fn.countAll<string>().as('n'))
      .where('tournament_id', '=', tournamentId)
      .where('status', '<>', 'withdrawn')
      .executeTakeFirstOrThrow()
    const state = registrationState(
      {
        status: t.status,
        access: t.access,
        teamSize: t.team_size,
        maxEntries: t.max_entries,
        entries: Number(n),
        startsAt: t.starts_at?.toISOString() ?? null,
        settings: t.settings,
      },
      { registered: mine !== undefined && mine.status !== 'withdrawn', hasBoard: user.hasBoard, eligible: user.eligible },
      now,
    )
    if (state !== 'open') return state
    if (mine) {
      await tx.updateTable('tournament_entries').set({ status: 'registered', name: user.name }).where('id', '=', mine.id).execute()
      return state
    }
    const entryId = randomUUID()
    await tx
      .insertInto('tournament_entries')
      .values({ id: entryId, tournament_id: tournamentId, name: user.name, registered_by_user_id: user.id })
      .execute()
    await tx
      .insertInto('tournament_players')
      .values({ id: randomUUID(), tournament_id: tournamentId, entry_id: entryId, user_id: user.id, name: user.name, position: 0 })
      .execute()
    return state
  })
}

/** Withdraws `userId`'s spot until the tournament is over; false when they hold none or it is too late. */
export async function withdrawSolo(db: Kysely<Database>, tournamentId: string, userId: string): Promise<boolean> {
  return db.transaction().execute(async tx => {
    const t = await tx.selectFrom('tournaments').select('status').where('id', '=', tournamentId).forUpdate().executeTakeFirst()
    if (!t || !canWithdraw(t.status)) return false
    const res = await tx
      .updateTable('tournament_entries')
      .set({ status: 'withdrawn' })
      .where('tournament_id', '=', tournamentId)
      .where('status', '<>', 'withdrawn')
      .where('id', 'in', eb =>
        eb.selectFrom('tournament_players').select('entry_id').where('tournament_id', '=', tournamentId).where('user_id', '=', userId),
      )
      .executeTakeFirst()
    return res.numUpdatedRows > 0n
  })
}

/**
 * When check-in opens: with an unlocked average limit, withdraws the entries whose players no
 * longer fit it (`keepsSpot`). Only players with an account are judged: a spot whose account was
 * deleted has no form, and guests come with #612. Returns each account that lost its spot with
 * why, to be told.
 */
export async function dropIneligibleEntries(
  db: Kysely<Database>,
  tournamentId: string,
): Promise<{ userId: string; eligibility: Eligibility }[]> {
  const t = await db.selectFrom('tournaments').select('settings').where('id', '=', tournamentId).executeTakeFirst()
  const limit = t?.settings.avgLimit ?? null
  if (limit === null || limit.lock) return []
  const players = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select(['p.entry_id', 'p.user_id'])
    .where('p.tournament_id', '=', tournamentId)
    .where('p.user_id', 'is not', null)
    .where('e.status', '<>', 'withdrawn')
    .$narrowType<{ user_id: string }>()
    .execute()
  const forms = await x01Forms(
    db,
    players.map(p => p.user_id),
    PROFILE_AVERAGE_DAYS,
  )
  const dropped = [...groupBy(players, p => p.entry_id)]
    .map(([id, ps]) => ({
      id,
      ps,
      eligibility: entryEligibility(
        limit,
        ps.map(p => forms.get(p.user_id) ?? NO_FORM),
      ),
    }))
    .filter(e => !keepsSpot(limit, e.eligibility))
  if (dropped.length === 0) return []
  await db
    .updateTable('tournament_entries')
    .set({ status: 'withdrawn' })
    .where('tournament_id', '=', tournamentId)
    .where(
      'id',
      'in',
      dropped.map(e => e.id),
    )
    .where('status', '<>', 'withdrawn')
    .execute()
  return dropped.flatMap(e => e.ps.map(p => ({ userId: p.user_id, eligibility: e.eligibility })))
}
