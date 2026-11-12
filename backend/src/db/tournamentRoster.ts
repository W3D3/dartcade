// A team's entry in a tournament (issue #610): the captain registers it with the players who play,
// each picked player confirms or declines, the captain changes a player, and registration's close
// releases what is still pending. An entry is `pending` while a place is empty or waits for its
// player; the spot counts as taken meanwhile. Who may do it and the picks' checks are in
// api/tournaments.ts with shared/tournaments/roster.ts; each write here locks the tournament row,
// so it runs after (and sees) any other registration.
import { randomUUID } from 'node:crypto'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'
import type { TournamentTeamRequest } from '../schema/lobby-ws.js'
import { PROFILE_AVERAGE_DAYS } from '../shared/avgClass.js'
import { NO_FORM } from '../shared/tournaments/avgLimit.js'
import {
  registrationClosesAt,
  registrationOpen,
  registrationState,
  type RegistrationState,
  type RegistrationTournament,
} from '../shared/tournaments/registration.js'
import { rosterComplete, slotsOf, type Candidate, type RosterSlot } from '../shared/tournaments/roster.js'
import { x01Forms } from './ranked.js'
import { toAvatar } from './users.js'
import type { TournamentRow } from './tournaments.js'

type TeamEntry = NonNullable<components['schemas']['TournamentTeamEntry']>
type TeamOption = components['schemas']['TournamentTeamOptions']['teams'][number]

const forRules = (t: TournamentRow, entries: number): RegistrationTournament => ({
  status: t.status,
  access: t.access,
  teamSize: t.team_size,
  maxEntries: t.max_entries,
  entries,
  startsAt: t.starts_at?.toISOString() ?? null,
  settings: t.settings,
})

const openAt = (t: TournamentRow, now: Date) =>
  registrationOpen({ status: t.status, startsAt: t.starts_at?.toISOString() ?? null, settings: t.settings }, now)

/** The tournament row, locked for the transaction: registrations and roster changes queue behind each other. */
const lockTournament = (tx: Transaction<Database>, id: string) =>
  tx.selectFrom('tournaments').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()

/** Which of `userIds` hold a spot (not withdrawn) in the tournament. */
async function holdingSpots(db: Kysely<Database>, tournamentId: string, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select('p.user_id')
    .where('p.tournament_id', '=', tournamentId)
    .where('p.user_id', 'in', userIds)
    .where('e.status', '<>', 'withdrawn')
    .$narrowType<{ user_id: string }>()
    .execute()
  return new Set(rows.map(r => r.user_id))
}

/** Frees `userIds`' places in the tournament's withdrawn entries (one place per person), so they can be picked again. */
async function clearWithdrawn(tx: Transaction<Database>, tournamentId: string, userIds: readonly string[]): Promise<void> {
  await tx
    .deleteFrom('tournament_players')
    .where('tournament_id', '=', tournamentId)
    .where('user_id', 'in', userIds)
    .where('entry_id', 'in', eb =>
      eb.selectFrom('tournament_entries').select('id').where('tournament_id', '=', tournamentId).where('status', '=', 'withdrawn'),
    )
    .execute()
}

/** Puts the entry to `registered` once every place is confirmed, back to `pending` otherwise. */
async function settleEntry(tx: Transaction<Database>, entryId: string, teamSize: number): Promise<void> {
  const players = await tx
    .selectFrom('tournament_players')
    .select(['position', 'user_id', 'name', 'confirmed_at'])
    .where('entry_id', '=', entryId)
    .execute()
  const complete = rosterComplete(players.map(slotOf), teamSize)
  await tx
    .updateTable('tournament_entries')
    .set({ status: complete ? 'registered' : 'pending' })
    .where('id', '=', entryId)
    .where('status', 'in', ['pending', 'registered'])
    .execute()
}

const slotOf = (p: { position: number; user_id: string | null; name: string; confirmed_at: Date | null }): RosterSlot => ({
  position: p.position,
  user: p.user_id === null ? null : { id: p.user_id, name: p.name },
  confirmed: p.confirmed_at !== null,
})

/** A player as Register a team judges them, with their first paired board's name. */
export type Judged = Candidate & { board: string | null }

/** Looks up each of `userIds`: their 30-day form, first paired board, and whether they hold a spot in the tournament. */
export async function candidatesOf(
  db: Kysely<Database>,
  tournamentId: string,
  userIds: readonly string[],
): Promise<(userId: string) => Judged> {
  const [forms, boards, taken] = await Promise.all([
    x01Forms(db, userIds, PROFILE_AVERAGE_DAYS),
    userIds.length === 0
      ? []
      : db.selectFrom('boards').select(['owner_user_id', 'name']).where('owner_user_id', 'in', userIds).orderBy('created_at').execute(),
    holdingSpots(db, tournamentId, userIds),
  ])
  return userId => {
    const board = boards.find(b => b.owner_user_id === userId)?.name ?? null
    return { userId, form: forms.get(userId) ?? NO_FORM, hasBoard: board !== null, board, taken: taken.has(userId) }
  }
}

/** The teams `userId` is in, the ones they captain first, with what Register a team shows of each member. */
export async function teamOptions(db: Kysely<Database>, tournamentId: string, userId: string): Promise<TeamOption[]> {
  const teams = await db
    .selectFrom('teams as t')
    .innerJoin('team_members as me', join => join.onRef('me.team_id', '=', 't.id').on('me.user_id', '=', userId))
    .select(['t.id', 't.name', 't.tag', 't.color', 't.captain_user_id'])
    .select(eb =>
      eb
        .exists(
          eb
            .selectFrom('tournament_entries as e')
            .whereRef('e.team_id', '=', 't.id')
            .where('e.tournament_id', '=', tournamentId)
            .where('e.status', '<>', 'withdrawn')
            .select('e.id'),
        )
        .as('entered'),
    )
    .orderBy(eb => eb.case().when('t.captain_user_id', '=', userId).then(0).else(1).end())
    .orderBy('me.joined_at')
    .execute()
  if (teams.length === 0) return []
  const members = await db
    .selectFrom('team_members as m')
    .innerJoin('user as u', 'u.id', 'm.user_id')
    .select(['m.team_id', 'u.id', 'u.name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'])
    .where(
      'm.team_id',
      'in',
      teams.map(t => t.id),
    )
    .orderBy('m.joined_at')
    .orderBy('u.id')
    .execute()
  const judge = await candidatesOf(db, tournamentId, [...new Set(members.map(m => m.id))])
  return teams.map(t => {
    const own = members.filter(m => m.team_id === t.id)
    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      color: t.color,
      captainId: t.captain_user_id,
      entered: Boolean(t.entered),
      members: [...own.filter(m => m.id === t.captain_user_id), ...own.filter(m => m.id !== t.captain_user_id)].map(m => {
        const { form, board, taken } = judge(m.id)
        return { user: { id: m.id, name: m.name, avatar: toAvatar(m) }, form, board, taken }
      }),
    }
  })
}

/**
 * Registers the captain's team with `players` (in throwing order) as a pending entry, the captain
 * confirmed when they play. `hasBoard` and `eligible` are the picks' checks; the spot, the close and
 * who already holds a spot are checked here under the lock. Returns what stood in the way, `taken`
 * when a picked player holds a spot, or `open` once registered.
 */
export async function registerTeam(
  db: Kysely<Database>,
  tournamentId: string,
  entry: {
    team: { id: string; name: string }
    captainId: string
    players: readonly { id: string; name: string }[]
    hasBoard: boolean
    eligible: boolean
  },
  now: Date,
): Promise<RegistrationState | 'taken' | null> {
  return db.transaction().execute(async tx => {
    const t = await lockTournament(tx, tournamentId)
    if (!t) return null
    const { n, entered } = await tx
      .selectFrom('tournament_entries')
      .select(eb => [eb.fn.countAll<string>().as('n'), eb.fn.countAll<string>().filterWhere('team_id', '=', entry.team.id).as('entered')])
      .where('tournament_id', '=', tournamentId)
      .where('status', '<>', 'withdrawn')
      .executeTakeFirstOrThrow()
    const state = registrationState(
      forRules(t, Number(n)),
      { registered: Number(entered) > 0, hasBoard: entry.hasBoard, eligible: entry.eligible, team: true },
      now,
    )
    if (state !== 'open') return state
    const ids = entry.players.map(p => p.id)
    if ((await holdingSpots(tx, tournamentId, ids)).size > 0) return 'taken'
    await clearWithdrawn(tx, tournamentId, ids)
    const entryId = randomUUID()
    await tx
      .insertInto('tournament_entries')
      .values({
        id: entryId,
        tournament_id: tournamentId,
        name: entry.team.name,
        status: 'pending',
        team_id: entry.team.id,
        registered_by_user_id: entry.captainId,
      })
      .execute()
    await tx
      .insertInto('tournament_players')
      .values(
        entry.players.map((p, position) => ({
          id: randomUUID(),
          tournament_id: tournamentId,
          entry_id: entryId,
          user_id: p.id,
          name: p.name,
          position,
          confirmed_at: p.id === entry.captainId ? now : null,
        })),
      )
      .execute()
    await settleEntry(tx, entryId, t.team_size)
    return state
  })
}

/**
 * The caller's team entries in these tournaments (as the captain who registered it, or a player in
 * it), not withdrawn: one per tournament, since a person holds one place per tournament.
 */
export async function teamEntriesOf(
  db: Kysely<Database>,
  tournamentIds: readonly string[],
  userId: string,
): Promise<Map<string, TeamEntry>> {
  const out = new Map<string, TeamEntry>()
  if (tournamentIds.length === 0) return out
  const entries = await db
    .selectFrom('tournament_entries as e')
    .innerJoin('tournaments as t', 't.id', 'e.tournament_id')
    .leftJoin('teams as tm', 'tm.id', 'e.team_id')
    .select(['e.id', 'e.tournament_id', 'e.status', 'e.registered_by_user_id', 't.team_size', 't.starts_at', 't.settings'])
    .select(['tm.id as team_id', 'tm.name as team_name', 'tm.tag', 'tm.color'])
    .where('e.tournament_id', 'in', tournamentIds)
    .where('t.team_size', '>', 1)
    // In-person teams are the organizers' list, not a captain's registration
    .where('t.access', '<>', 'in_person')
    .where('e.status', '<>', 'withdrawn')
    .where(eb =>
      eb.or([
        eb('e.registered_by_user_id', '=', userId),
        eb.exists(
          eb.selectFrom('tournament_players as p').whereRef('p.entry_id', '=', 'e.id').where('p.user_id', '=', userId).select('p.id'),
        ),
      ]),
    )
    .$narrowType<{ status: TeamEntry['status'] }>()
    .execute()
  if (entries.length === 0) return out
  const players = await db
    .selectFrom('tournament_players')
    .select(['entry_id', 'position', 'user_id', 'name', 'confirmed_at'])
    .where(
      'entry_id',
      'in',
      entries.map(e => e.id),
    )
    .execute()
  for (const e of entries)
    out.set(e.tournament_id, {
      entryId: e.id,
      status: e.status,
      team:
        e.team_id !== null && e.team_name !== null && e.tag !== null && e.color !== null
          ? { id: e.team_id, name: e.team_name, tag: e.tag, color: e.color }
          : null,
      captainId: e.registered_by_user_id,
      confirmBy: registrationClosesAt({ startsAt: e.starts_at?.toISOString() ?? null, settings: e.settings }),
      slots: slotsOf(players.filter(p => p.entry_id === e.id).map(slotOf), e.team_size),
    })
  return out
}

/** Why a roster change was refused: `closed` registration, `none` (no such place of the caller's), `confirmed` (that player confirmed), `taken` (the new player holds a spot). */
export type RosterRefusal = 'closed' | 'none' | 'confirmed' | 'taken'

/**
 * A picked player answers: `accept` confirms their place (the entry is registered once every place
 * is), else frees it, also after they confirmed. Only while registration is open.
 */
export async function answerRequest(
  db: Kysely<Database>,
  tournamentId: string,
  userId: string,
  accept: boolean,
  now: Date,
): Promise<{ captainId: string | null } | RosterRefusal> {
  return db.transaction().execute(async tx => {
    const t = await lockTournament(tx, tournamentId)
    // In person the organizers add (and players claim) the spots: nobody confirms them
    if (!t || t.team_size < 2 || t.access === 'in_person') return 'none'
    if (!openAt(t, now)) return 'closed'
    const mine = await tx
      .selectFrom('tournament_players as p')
      .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
      .select(['p.id', 'p.entry_id', 'e.registered_by_user_id'])
      .where('p.tournament_id', '=', tournamentId)
      .where('p.user_id', '=', userId)
      .where('e.status', 'in', ['pending', 'registered'])
      .executeTakeFirst()
    if (!mine) return 'none'
    if (accept)
      await tx
        .updateTable('tournament_players')
        .set({ confirmed_at: now })
        .where('id', '=', mine.id)
        .where('confirmed_at', 'is', null)
        .execute()
    else await tx.deleteFrom('tournament_players').where('id', '=', mine.id).execute()
    await settleEntry(tx, mine.entry_id, t.team_size)
    return { captainId: mine.registered_by_user_id }
  })
}

/**
 * The captain puts `player` in place `position` of their team's entry: an empty place, or one whose
 * player has not confirmed (they lose it). The picks' checks are the caller's; the place, the close
 * and who holds a spot are checked here under the lock.
 */
export async function changePlayer(
  db: Kysely<Database>,
  tournamentId: string,
  captainId: string,
  position: number,
  player: { id: string; name: string },
  now: Date,
): Promise<'changed' | RosterRefusal> {
  return db.transaction().execute(async tx => {
    const t = await lockTournament(tx, tournamentId)
    if (!t || position >= t.team_size || t.access === 'in_person') return 'none'
    if (!openAt(t, now)) return 'closed'
    const entry = await tx
      .selectFrom('tournament_entries')
      .select('id')
      .where('tournament_id', '=', tournamentId)
      .where('registered_by_user_id', '=', captainId)
      .where('team_id', 'is not', null)
      .where('status', 'in', ['pending', 'registered'])
      .executeTakeFirst()
    if (!entry) return 'none'
    const current = await tx
      .selectFrom('tournament_players')
      .select(['id', 'user_id', 'confirmed_at'])
      .where('entry_id', '=', entry.id)
      .where('position', '=', position)
      .executeTakeFirst()
    if (current?.user_id === player.id) return 'changed'
    if (current?.confirmed_at != null) return 'confirmed'
    if ((await holdingSpots(tx, tournamentId, [player.id])).size > 0) return 'taken'
    await clearWithdrawn(tx, tournamentId, [player.id])
    if (current) await tx.deleteFrom('tournament_players').where('id', '=', current.id).execute()
    await tx
      .insertInto('tournament_players')
      .values({
        id: randomUUID(),
        tournament_id: tournamentId,
        entry_id: entry.id,
        user_id: player.id,
        name: player.name,
        position,
        confirmed_at: player.id === captainId ? now : null,
      })
      .execute()
    await settleEntry(tx, entry.id, t.team_size)
    return 'changed'
  })
}

/** At registration's close: withdraws the entries still pending, freeing their spots. Returns how many. */
export async function releaseUnconfirmed(db: Kysely<Database>, tournamentId: string): Promise<number> {
  const res = await db
    .updateTable('tournament_entries')
    .set({ status: 'withdrawn' })
    .where('tournament_id', '=', tournamentId)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
}

/** The places `userId` was picked for and has not answered, in tournaments still taking answers, soonest deadline first. */
export async function teamRequestsFor(db: Kysely<Database>, userId: string, now = new Date()): Promise<TournamentTeamRequest[]> {
  const rows = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .innerJoin('tournaments as t', 't.id', 'e.tournament_id')
    .innerJoin('teams as tm', 'tm.id', 'e.team_id')
    .leftJoin('user as u', 'u.id', 'e.registered_by_user_id')
    .select(['t.id as tournament_id', 't.name as tournament_name', 't.status', 't.starts_at', 't.settings'])
    .select(['tm.id as team_id', 'tm.name as team_name', 'tm.tag', 'tm.color'])
    .select(['u.id as captain_id', 'u.name as captain_name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'])
    .where('p.user_id', '=', userId)
    .where('p.confirmed_at', 'is', null)
    .where('e.status', '=', 'pending')
    .where('t.status', '=', 'open')
    .execute()
  return rows
    .filter(r => registrationOpen({ status: r.status, startsAt: r.starts_at?.toISOString() ?? null, settings: r.settings }, now))
    .map(r => ({
      tournamentId: r.tournament_id,
      tournamentName: r.tournament_name,
      team: { id: r.team_id, name: r.team_name, tag: r.tag, color: r.color },
      from:
        r.captain_id !== null && r.captain_name !== null && r.avatar_kind !== null && r.avatar_version !== null
          ? {
              id: r.captain_id,
              name: r.captain_name,
              avatar: toAvatar({ ...r, avatar_kind: r.avatar_kind, avatar_version: r.avatar_version }),
            }
          : null,
      confirmBy: registrationClosesAt({ startsAt: r.starts_at?.toISOString() ?? null, settings: r.settings }),
    }))
    .sort(
      (a, b) => (a.confirmBy === null ? Infinity : Date.parse(a.confirmBy)) - (b.confirmBy === null ? Infinity : Date.parse(b.confirmBy)),
    )
}
