// An in-person tournament's participants (migration 071): the entries its organizers add, each with
// spots (tournament_players of kind 'spot') that carry a claim link until someone claims them.
import { randomBytes, randomUUID } from 'node:crypto'
import type { Kysely, Transaction, Updateable } from 'kysely'
import type { Database, TournamentsTable } from './schema.js'
import type { TeamColor } from '../shared/teams.js'
import type { EntryInput } from '../shared/tournaments/participants.js'

export interface SpotRow {
  id: string
  name: string
  claimCode: string
  claimedBy: { id: string; name: string } | null
}

export interface ParticipantRow {
  id: string
  name: string
  tag: string | null
  color: TeamColor | null
  players: SpotRow[]
}

/** 96 random bits: a claim link hands over a spot and its games, so it can't be guessed. */
const newClaimCode = () => randomBytes(12).toString('base64url')

/** The entries in the organizers' order, each with its spots in team order. */
export async function listParticipants(db: Kysely<Database>, tournamentId: string): Promise<ParticipantRow[]> {
  const [entries, spots] = await Promise.all([
    db
      .selectFrom('tournament_entries')
      .select(['id', 'name', 'tag', 'color'])
      .where('tournament_id', '=', tournamentId)
      .orderBy('list_position')
      .orderBy('created_at')
      .orderBy('id')
      .execute(),
    db
      .selectFrom('tournament_players as p')
      .leftJoin('user as u', 'u.id', 'p.user_id')
      .select(['p.id', 'p.entry_id', 'p.name', 'p.claim_code', 'p.user_id', 'u.name as user_name'])
      .where('p.tournament_id', '=', tournamentId)
      .where('p.kind', '=', 'spot')
      .orderBy('p.position')
      .execute(),
  ])
  return entries.map(e => ({
    ...e,
    players: spots
      .filter(s => s.entry_id === e.id)
      .map(s => ({
        id: s.id,
        name: s.name,
        claimCode: s.claim_code ?? '',
        claimedBy: s.user_id !== null && s.user_name !== null ? { id: s.user_id, name: s.user_name } : null,
      })),
  }))
}

export type SetParticipantsResult = 'ok' | 'missing' | 'started' | 'unknown id' | 'claimed'

/** Positions are moved out of the way first, so swapping two spots never trips UNIQUE (entry_id, position). */
const PARKED = 1000

/**
 * Replaces the participants with `entries` (cleaned and checked by participantProblems) while the
 * tournament has not started: stored ids are kept (their claim links too), the rest is removed.
 * `tournament` is written in the same transaction, so a new team size and its list land together.
 * The tournament row is locked, so two organizers saving at once take turns.
 */
export async function setParticipants(
  db: Kysely<Database>,
  tournamentId: string,
  entries: readonly EntryInput[],
  tournament?: Updateable<TournamentsTable>,
): Promise<SetParticipantsResult> {
  return db.transaction().execute(async tx => {
    const t = await tx.selectFrom('tournaments').select('status').where('id', '=', tournamentId).forUpdate().executeTakeFirst()
    if (!t) return 'missing'
    if (t.status !== 'draft' && t.status !== 'open') return 'started'
    const [storedEntries, storedSpots] = await Promise.all([
      tx.selectFrom('tournament_entries').select('id').where('tournament_id', '=', tournamentId).execute(),
      tx
        .selectFrom('tournament_players')
        .select(['id', 'name', 'user_id'])
        .where('tournament_id', '=', tournamentId)
        .where('kind', '=', 'spot')
        .execute(),
    ])
    const entryIds = new Set(storedEntries.map(e => e.id))
    const spots = new Map(storedSpots.map(s => [s.id, s]))
    const players = entries.flatMap(e => e.players)
    if (entries.some(e => e.id !== undefined && !entryIds.has(e.id)) || players.some(p => p.id !== undefined && !spots.has(p.id)))
      return 'unknown id'
    if (players.some(p => p.id !== undefined && spots.get(p.id)?.user_id !== null && spots.get(p.id)?.name !== p.name)) return 'claimed'
    if (tournament) await tx.updateTable('tournaments').set(tournament).where('id', '=', tournamentId).execute()

    const keptSpots = players.flatMap(p => (p.id === undefined ? [] : [p.id]))
    await removeAllBut(tx, 'tournament_players', tournamentId, keptSpots)
    if (keptSpots.length > 0)
      await tx
        .updateTable('tournament_players')
        .set(eb => ({ position: eb('position', '+', PARKED) }))
        .where('id', 'in', keptSpots)
        .execute()

    const ids = entries.map(e => e.id ?? randomUUID())
    for (const [i, e] of entries.entries()) {
      const entry = { name: e.name, tag: e.tag, color: e.color, list_position: i }
      const entryId = ids[i]
      if (e.id === undefined)
        await tx
          .insertInto('tournament_entries')
          .values({ id: entryId, tournament_id: tournamentId, ...entry })
          .execute()
      else await tx.updateTable('tournament_entries').set(entry).where('id', '=', entryId).execute()
      for (const [position, p] of e.players.entries()) {
        if (p.id === undefined)
          await tx
            .insertInto('tournament_players')
            .values({
              id: randomUUID(),
              tournament_id: tournamentId,
              entry_id: entryId,
              name: p.name,
              position,
              kind: 'spot',
              claim_code: newClaimCode(),
            })
            .execute()
        else await tx.updateTable('tournament_players').set({ entry_id: entryId, name: p.name, position }).where('id', '=', p.id).execute()
      }
    }
    // Last: a dropped entry's spots that moved to another entry must not go with it
    await removeAllBut(tx, 'tournament_entries', tournamentId, ids)
    return 'ok'
  })
}

async function removeAllBut(
  tx: Transaction<Database>,
  table: 'tournament_players' | 'tournament_entries',
  tournamentId: string,
  keep: string[],
): Promise<void> {
  let q = tx.deleteFrom(table).where('tournament_id', '=', tournamentId)
  if (table === 'tournament_players') q = q.where('kind', '=', 'spot')
  if (keep.length > 0) q = q.where('id', 'not in', keep)
  await q.execute()
}

/**
 * Turns a claimed spot back into a guest: the account lets go of it and of the seats it played
 * (Q14: achievements and XP already earned stay). False when it is no claimed spot of the tournament.
 */
export async function unlinkSpot(db: Kysely<Database>, tournamentId: string, spotId: string): Promise<boolean> {
  return db.transaction().execute(async tx => {
    const spot = await tx
      .updateTable('tournament_players')
      .set({ user_id: null })
      .where('id', '=', spotId)
      .where('tournament_id', '=', tournamentId)
      .where('kind', '=', 'spot')
      .where('user_id', 'is not', null)
      .returning('id')
      .executeTakeFirst()
    if (!spot) return false
    await tx.updateTable('game_players').set({ user_id: null }).where('tournament_player_id', '=', spotId).execute()
    return true
  })
}
