// Running an online tournament (tournaments/service.ts): its entries and their seeds, the bracket's
// match rows, the games played for them. Status changes still go through moveTournament/moveMatch.
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from './schema.js'
import { moveTournament, type TournamentMatchRow, type TournamentRow } from './tournaments.js'
import type { Match } from '../shared/tournaments/bracket.js'

// X01 and Cricket put each seat's legs in its stats
const LegsSchema = z.object({ legsWon: z.number() }).catch({ legsWon: 0 })

export interface RunEntry {
  id: string
  name: string
  status: 'pending' | 'registered' | 'checked_in' | 'withdrawn'
  seed: number | null
  created_at: Date
  /** The entry's players in team order: a solo entry has one. */
  players: { id: string; userId: string | null; name: string }[]
}

export async function getTournamentRow(db: Kysely<Database>, id: string): Promise<TournamentRow | undefined> {
  return db.selectFrom('tournaments').selectAll().where('id', '=', id).executeTakeFirst()
}

/** Online tournaments whose check-in or start may be due: published, with a start time. */
export async function scheduledTournaments(db: Kysely<Database>): Promise<TournamentRow[]> {
  return db
    .selectFrom('tournaments')
    .selectAll()
    .where('status', 'in', ['open', 'check_in'])
    .where('access', '<>', 'in_person')
    .where('starts_at', 'is not', null)
    .execute()
}

export async function runningTournamentIds(db: Kysely<Database>): Promise<string[]> {
  const rows = await db.selectFrom('tournaments').select('id').where('status', '=', 'running').where('access', '<>', 'in_person').execute()
  return rows.map(r => r.id)
}

/** An organizer started a tournament without a start time: it starts once the check-in ends. */
export async function setStartTime(db: Kysely<Database>, id: string, startsAt: Date): Promise<boolean> {
  const res = await db
    .updateTable('tournaments')
    .set({ starts_at: startsAt })
    .where('id', '=', id)
    .where('status', '=', 'open')
    .where('starts_at', 'is', null)
    .executeTakeFirst()
  return res.numUpdatedRows > 0n
}

export async function listEntries(db: Kysely<Database>, tournamentId: string): Promise<RunEntry[]> {
  const [entries, players] = await Promise.all([
    db
      .selectFrom('tournament_entries')
      .select(['id', 'name', 'status', 'seed', 'created_at'])
      .where('tournament_id', '=', tournamentId)
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('tournament_players')
      .select(['id', 'entry_id', 'user_id', 'name'])
      .where('tournament_id', '=', tournamentId)
      .orderBy('position')
      .execute(),
  ])
  return entries.map(e => ({
    ...e,
    players: players.filter(p => p.entry_id === e.id).map(p => ({ id: p.id, userId: p.user_id, name: p.name })),
  }))
}

/** `userId` checks in during the check-in; false when they hold no registered spot or it is not check-in time. */
export async function checkIn(db: Kysely<Database>, tournamentId: string, userId: string): Promise<boolean> {
  const res = await db
    .updateTable('tournament_entries')
    .set({ status: 'checked_in' })
    .where('tournament_id', '=', tournamentId)
    .where('status', '=', 'registered')
    .where(eb =>
      eb.exists(
        eb
          .selectFrom('tournaments')
          .whereRef('tournaments.id', '=', 'tournament_entries.tournament_id')
          .where('status', '=', 'check_in')
          .select('id'),
      ),
    )
    .where('id', 'in', eb =>
      eb.selectFrom('tournament_players').select('entry_id').where('tournament_id', '=', tournamentId).where('user_id', '=', userId),
    )
    .executeTakeFirst()
  return res.numUpdatedRows > 0n
}

/**
 * Starts the tournament with its draw: entries left out of `seeded` (no check-in) are withdrawn,
 * the others get their seed, and every match of the draw gets a row, waiting for its sides. False
 * when the tournament moved on meanwhile.
 */
export async function writeDraw(
  db: Kysely<Database>,
  tournamentId: string,
  seeded: readonly string[],
  matches: readonly Match[],
): Promise<boolean> {
  return db.transaction().execute(async tx => {
    if ((await moveTournament(tx, tournamentId, 'start')) === null) return false
    const out = tx.updateTable('tournament_entries').set({ status: 'withdrawn' }).where('tournament_id', '=', tournamentId)
    await (seeded.length > 0 ? out.where('id', 'not in', seeded) : out).where('status', '<>', 'withdrawn').execute()
    for (const [i, id] of seeded.entries())
      await tx
        .updateTable('tournament_entries')
        .set({ seed: i + 1 })
        .where('id', '=', id)
        .execute()
    await tx
      .insertInto('tournament_matches')
      .values(
        matches.map(m => ({
          id: randomUUID(),
          tournament_id: tournamentId,
          bracket: m.bracket,
          group_no: m.group,
          round: m.round,
          slot: m.index,
          first_to: m.firstTo,
        })),
      )
      .execute()
    return true
  })
}

export async function listMatches(db: Kysely<Database>, tournamentId: string): Promise<TournamentMatchRow[]> {
  return db.selectFrom('tournament_matches').selectAll().where('tournament_id', '=', tournamentId).execute()
}

export async function tournamentOfMatch(db: Kysely<Database>, matchId: string): Promise<string | undefined> {
  return (await db.selectFrom('tournament_matches').select('tournament_id').where('id', '=', matchId).executeTakeFirst())?.tournament_id
}

/** Puts the entries the bracket now knows into a match still waiting for them. */
export async function setSides(db: Kysely<Database>, matchId: string, a: string | null, b: string | null): Promise<void> {
  await db
    .updateTable('tournament_matches')
    .set({ entry_a_id: a, entry_b_id: b })
    .where('id', '=', matchId)
    .where('status', '=', 'pending')
    .execute()
}

/** Drops matches the bracket no longer plays (a double elimination's reset final). */
export async function deleteMatches(db: Kysely<Database>, ids: readonly string[]): Promise<void> {
  if (ids.length > 0) await db.deleteFrom('tournament_matches').where('id', 'in', ids).where('status', '=', 'pending').execute()
}

/** The latest game played for a match, if any. */
export async function latestGame(
  db: Kysely<Database>,
  matchId: string,
): Promise<{ id: string; status: string; aborted_by_user_id: string | null } | undefined> {
  return db
    .selectFrom('game_sessions')
    .select(['id', 'status', 'aborted_by_user_id'])
    .where('tournament_match_id', '=', matchId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .executeTakeFirst()
}

/** A finished game's seats in seat order: who placed where and how many legs each won. */
export async function seatResults(db: Kysely<Database>, sessionId: string): Promise<{ placement: number | null; legsWon: number }[]> {
  const rows = await db
    .selectFrom('game_players')
    .select(['placement', 'stats'])
    .where('session_id', '=', sessionId)
    .orderBy('seat')
    .execute()
  return rows.map(r => ({ placement: r.placement, legsWon: LegsSchema.parse(r.stats).legsWon }))
}

/** Records which tournament spot each seat of a game plays for, in seat order. */
export async function linkSeats(db: Kysely<Database>, sessionId: string, playerIds: readonly string[]): Promise<void> {
  for (const [seat, id] of playerIds.entries())
    await db
      .updateTable('game_players')
      .set({ tournament_player_id: id })
      .where('session_id', '=', sessionId)
      .where('seat', '=', seat)
      .execute()
}

/** Finishes the tournament with every entry's final place; false when it already moved on. */
export async function finishWithPlaces(db: Kysely<Database>, tournamentId: string, places: ReadonlyMap<string, number>): Promise<boolean> {
  return db.transaction().execute(async tx => {
    if ((await moveTournament(tx, tournamentId, 'finish')) === null) return false
    for (const [entryId, place] of places)
      await tx
        .updateTable('tournament_entries')
        .set({ final_place: place })
        .where('id', '=', entryId)
        .where('tournament_id', '=', tournamentId)
        .execute()
    return true
  })
}
