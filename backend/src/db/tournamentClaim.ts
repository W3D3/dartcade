// Claiming a spot of an in-person tournament (migration 071's claim_code): the account takes the spot
// and the seats it played, so those games show in its history and stats. Unlinking is in
// tournamentParticipants.ts; both drop the games' stored details so they rebuild with the right names.
import { randomBytes } from 'node:crypto'
import type { Kysely, Transaction } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'
import { BRACKET_ORDER } from '../shared/tournaments/bracket.js'
import { matchTitle } from '../shared/tournaments/mine.js'

type Played = components['schemas']['TournamentClaim']['played'][number]

export interface ClaimSpot {
  id: string
  name: string
  userId: string | null
  tournamentId: string
  tournamentName: string
  organizer: string | null
  startsAt: Date | null
  /** The entry's name; for a team tournament only. */
  teamName: string | null
  entryId: string
}

/** 96 random bits: a claim link hands over a spot and its games, so it can't be guessed. */
export const newClaimCode = () => randomBytes(12).toString('base64url')

/** The spot a claim link names; null for an unknown or reissued link, or a tournament not published yet. */
export async function spotByCode(db: Kysely<Database> | Transaction<Database>, code: string): Promise<ClaimSpot | null> {
  const r = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournaments as t', 't.id', 'p.tournament_id')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .leftJoin('user as o', 'o.id', 't.owner_user_id')
    .select([
      'p.id',
      'p.name',
      'p.user_id',
      'p.tournament_id',
      'p.entry_id',
      't.name as tournament_name',
      't.starts_at',
      't.team_size',
      'e.name as entry_name',
      'o.name as organizer',
    ])
    .where('p.claim_code', '=', code)
    .where('p.kind', '=', 'spot')
    .where('t.status', '<>', 'draft')
    .executeTakeFirst()
  if (!r) return null
  return {
    id: r.id,
    name: r.name,
    userId: r.user_id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    organizer: r.organizer,
    startsAt: r.starts_at,
    teamName: r.team_size > 1 ? r.entry_name : null,
    entryId: r.entry_id,
  }
}

/** Whether the account holds a spot of the tournament other than `spotId`. */
export async function holdsOtherSpot(
  db: Kysely<Database> | Transaction<Database>,
  tournamentId: string,
  userId: string,
  spotId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom('tournament_players')
    .select('id')
    .where('tournament_id', '=', tournamentId)
    .where('kind', '=', 'spot')
    .where('user_id', '=', userId)
    .where('id', '<>', spotId)
    .executeTakeFirst()
  return row !== undefined
}

/** The entry's matches in play order (groups, winners' bracket, lower bracket, final), titled like My tournaments does. */
export async function playedSoFar(db: Kysely<Database>, spot: Pick<ClaimSpot, 'entryId' | 'tournamentId'>): Promise<Played[]> {
  const [rows, rounds] = await Promise.all([
    db
      .selectFrom('tournament_matches as m')
      .leftJoin('tournament_entries as a', 'a.id', 'm.entry_a_id')
      .leftJoin('tournament_entries as b', 'b.id', 'm.entry_b_id')
      .select([
        'm.bracket',
        'm.group_no',
        'm.round',
        'm.slot',
        'm.status',
        'm.outcome',
        'm.winner_entry_id',
        'm.legs_a',
        'm.legs_b',
        'm.entry_a_id',
        'a.name as a_name',
        'b.name as b_name',
      ])
      .where('m.tournament_id', '=', spot.tournamentId)
      .where(eb => eb.or([eb('m.entry_a_id', '=', spot.entryId), eb('m.entry_b_id', '=', spot.entryId)]))
      .execute(),
    db
      .selectFrom('tournament_matches')
      .select(eb => eb.fn.max('round').as('rounds'))
      .where('tournament_id', '=', spot.tournamentId)
      .where('bracket', '=', 'main')
      .executeTakeFirst(),
  ])
  const mainRounds = rounds?.rounds ?? 0
  return rows
    .filter(r => r.outcome !== 'bye')
    .sort((x, y) => BRACKET_ORDER[x.bracket] - BRACKET_ORDER[y.bracket] || x.round - y.round || x.slot - y.slot)
    .map(r => {
      const mine = r.entry_a_id === spot.entryId
      const finished = r.status === 'finished'
      return {
        title: matchTitle({ bracket: r.bracket, group: r.group_no, round: r.round }, mainRounds),
        opponent: mine ? r.b_name : r.a_name,
        state: !finished ? 'next' : r.winner_entry_id === spot.entryId ? 'won' : 'lost',
        legs: finished ? (mine ? `${r.legs_a}-${r.legs_b}` : `${r.legs_b}-${r.legs_a}`) : null,
      }
    })
}

export type ClaimResult = { spot: ClaimSpot; sessionIds: string[] } | 'missing' | 'already claimed' | 'already has a spot'

/**
 * Gives the spot to the account and its seats' games with it. Claiming a spot you hold is fine and
 * hands over nothing again. The tournament row is locked, so two claims never take one spot or two
 * spots of one person. `sessionIds` are the finished games the account now plays in (to be counted).
 */
export async function claimSpot(db: Kysely<Database>, code: string, userId: string): Promise<ClaimResult> {
  return db.transaction().execute(async tx => {
    const found = await spotByCode(tx, code)
    if (!found) return 'missing'
    await tx.selectFrom('tournaments').select('id').where('id', '=', found.tournamentId).forUpdate().execute()
    const spot = await spotByCode(tx, code)
    if (!spot) return 'missing'
    if (spot.userId === userId) return { spot, sessionIds: [] }
    if (spot.userId !== null) return 'already claimed'
    if (await holdsOtherSpot(tx, spot.tournamentId, userId, spot.id)) return 'already has a spot'
    await tx.updateTable('tournament_players').set({ user_id: userId }).where('id', '=', spot.id).execute()
    const sessionIds = await moveSeats(tx, spot.id, userId)
    return { spot: { ...spot, userId }, sessionIds }
  })
}

/**
 * Points the spot's seats at `userId` (null: back to the guest) and drops those games' stored details,
 * which hold the seat's account. Returns the games' ids.
 */
export async function moveSeats(tx: Transaction<Database>, spotId: string, userId: string | null): Promise<string[]> {
  const seats = await tx
    .updateTable('game_players')
    .set({ user_id: userId })
    .where('tournament_player_id', '=', spotId)
    .returning('session_id')
    .execute()
  const ids = seats.map(s => s.session_id)
  if (ids.length > 0) await tx.deleteFrom('game_details').where('session_id', 'in', ids).execute()
  return ids
}

/** Swaps the spot's claim code for a new one while it is unclaimed; false when it is claimed or not the tournament's. */
export async function reissueCode(db: Kysely<Database>, tournamentId: string, spotId: string): Promise<'ok' | 'missing' | 'claimed'> {
  const spot = await db
    .selectFrom('tournament_players')
    .select('user_id')
    .where('id', '=', spotId)
    .where('tournament_id', '=', tournamentId)
    .where('kind', '=', 'spot')
    .executeTakeFirst()
  if (!spot) return 'missing'
  if (spot.user_id !== null) return 'claimed'
  await db
    .updateTable('tournament_players')
    .set({ claim_code: newClaimCode() })
    .where('id', '=', spotId)
    .where('user_id', 'is', null)
    .execute()
  return 'ok'
}
