// What the My tournaments tab shows of one player (GET /api/tournaments/mine): the spots they hold,
// their next opponent, the running match, W-L and 3-dart average per finished tournament.
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import { toView, viewQuery, type TournamentView } from './tournaments.js'

export interface Spot {
  t: TournamentView
  entryId: string
  entryName: string
  entryStatus: 'pending' | 'registered' | 'checked_in'
  finalPlace: number | null
  playerId: string
  playerName: string
}

/** The spots `userId` holds in tournaments that are published and not cancelled (withdrawn ones left out). */
export async function listSpots(db: Kysely<Database>, userId: string): Promise<Spot[]> {
  const rows = await viewQuery(db)
    .innerJoin('tournament_players as p', 'p.tournament_id', 't.id')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select([
      'e.id as entry_id',
      'e.name as entry_name',
      'e.status as entry_status',
      'e.final_place',
      'p.id as player_id',
      'p.name as player_name',
    ])
    .where('p.user_id', '=', userId)
    .where('e.status', '<>', 'withdrawn')
    .where('t.status', 'in', ['open', 'check_in', 'running', 'finished'])
    .execute()
  return rows.map(({ entry_id, entry_name, entry_status, final_place, player_id, player_name, ...t }) => ({
    t: toView(t),
    entryId: entry_id,
    entryName: entry_name,
    // withdrawn ones were filtered out above
    entryStatus: entry_status === 'withdrawn' ? 'registered' : entry_status,
    finalPlace: final_place,
    playerId: player_id,
    playerName: player_name,
  }))
}

/** Teammates who have not confirmed the captain's request yet, by entry id. */
export async function unconfirmedTeammates(
  db: Kysely<Database>,
  entryIds: readonly string[],
  userId: string,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (entryIds.length === 0) return out
  const rows = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select(['p.entry_id', 'p.name'])
    .where('p.entry_id', 'in', entryIds)
    .where('e.status', '=', 'pending')
    .where('p.confirmed_at', 'is', null)
    .where(eb => eb.or([eb('p.user_id', 'is', null), eb('p.user_id', '<>', userId)]))
    .orderBy('p.position')
    .execute()
  for (const r of rows) out.set(r.entry_id, [...(out.get(r.entry_id) ?? []), r.name])
  return out
}

export interface OpenMatch {
  entryId: string
  tournamentId: string
  bracket: 'main' | 'lower' | 'final' | 'group'
  groupNo: number | null
  round: number
  firstTo: number
  status: 'pending' | 'ready' | 'live'
  opponent: string | null
  /** The match's game while it runs. */
  sessionId: string | null
  /** Rounds of the tournament's main bracket, to name this round. */
  mainRounds: number
}

/** The matches not yet decided that these entries play in, soonest round first, one row per entry and match. */
export async function openMatches(db: Kysely<Database>, entryIds: readonly string[]): Promise<OpenMatch[]> {
  if (entryIds.length === 0) return []
  const rows = await db
    .selectFrom('tournament_matches as m')
    .leftJoin('tournament_entries as a', 'a.id', 'm.entry_a_id')
    .leftJoin('tournament_entries as b', 'b.id', 'm.entry_b_id')
    .select(eb => [
      'm.id',
      'm.tournament_id',
      'm.bracket',
      'm.group_no',
      'm.round',
      'm.first_to',
      'm.status',
      'm.entry_a_id',
      'm.entry_b_id',
      'a.name as a_name',
      'b.name as b_name',
      eb
        .selectFrom('game_sessions as g')
        .select('g.id')
        .whereRef('g.tournament_match_id', '=', 'm.id')
        .where('g.status', '=', 'active')
        .orderBy('g.created_at', 'desc')
        .limit(1)
        .as('session_id'),
      eb
        .selectFrom('tournament_matches as r')
        .select(r => r.fn.max('r.round').as('rounds'))
        .whereRef('r.tournament_id', '=', 'm.tournament_id')
        .where('r.bracket', '=', 'main')
        .as('main_rounds'),
    ])
    .where('m.status', '<>', 'finished')
    .where(eb => eb.or([eb('m.entry_a_id', 'in', entryIds), eb('m.entry_b_id', 'in', entryIds)]))
    .orderBy('m.round')
    .orderBy('m.slot')
    .execute()
  return rows.flatMap(r =>
    ([[r.entry_a_id, r.b_name] as const, [r.entry_b_id, r.a_name] as const] as const)
      .filter((side): side is readonly [string, string | null] => side[0] !== null && entryIds.includes(side[0]))
      .map(([entryId, opponent]) => ({
        entryId,
        tournamentId: r.tournament_id,
        bracket: r.bracket,
        groupNo: r.group_no,
        round: r.round,
        firstTo: r.first_to,
        status: r.status === 'finished' ? ('pending' as const) : r.status,
        opponent,
        sessionId: r.session_id,
        mainRounds: r.main_rounds ?? 0,
      })),
  )
}

/** Matches won and lost by each entry over its decided matches (a bye is neither). */
export async function recordOf(db: Kysely<Database>, entryIds: readonly string[]): Promise<Map<string, { won: number; lost: number }>> {
  const out = new Map(entryIds.map(id => [id, { won: 0, lost: 0 }]))
  if (entryIds.length === 0) return out
  const rows = await db
    .selectFrom('tournament_matches')
    .select(['entry_a_id', 'entry_b_id', 'winner_entry_id'])
    .where('status', '=', 'finished')
    .where('outcome', '<>', 'bye')
    .where(eb => eb.or([eb('entry_a_id', 'in', entryIds), eb('entry_b_id', 'in', entryIds)]))
    .execute()
  for (const r of rows)
    for (const id of [r.entry_a_id, r.entry_b_id]) {
      const rec = id === null ? undefined : out.get(id)
      if (!rec) continue
      if (r.winner_entry_id === id) rec.won++
      else rec.lost++
    }
  return out
}

/** Per spot: the sum of average x darts and the darts, over the X01 games played for it that still count. */
export async function averageParts(
  db: Kysely<Database>,
  playerIds: readonly string[],
): Promise<Map<string, { weighted: number; darts: number }>> {
  const out = new Map<string, { weighted: number; darts: number }>()
  if (playerIds.length === 0) return out
  const rows = await db
    .selectFrom('game_players as gp')
    .innerJoin('game_sessions as g', 'g.id', 'gp.session_id')
    .select([
      'gp.tournament_player_id as player_id',
      sql<string>`sum((gp.stats->>'average')::float8 * (gp.stats->>'dartsThrown')::int)`.as('weighted'),
      sql<string>`sum((gp.stats->>'dartsThrown')::int)`.as('darts'),
    ])
    .where('gp.tournament_player_id', 'in', playerIds)
    .where('g.game_id', '=', 'x01')
    .where('g.status', '=', 'finished')
    .where('g.invalidated_at', 'is', null)
    .where(sql<boolean>`(gp.stats->>'dartsThrown')::int > 0`)
    .groupBy('gp.tournament_player_id')
    .execute()
  for (const r of rows) if (r.player_id) out.set(r.player_id, { weighted: Number(r.weighted), darts: Number(r.darts) })
  return out
}

/** How many of each in-person tournament's spots an account has claimed, by tournament id. */
export async function claimedCounts(db: Kysely<Database>, tournamentIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (tournamentIds.length === 0) return out
  const rows = await db
    .selectFrom('tournament_players as p')
    .innerJoin('tournament_entries as e', 'e.id', 'p.entry_id')
    .select(['p.tournament_id', eb => eb.fn.countAll<string>().as('n')])
    .where('p.tournament_id', 'in', tournamentIds)
    .where('p.user_id', 'is not', null)
    .where('e.status', '<>', 'withdrawn')
    .groupBy('p.tournament_id')
    .execute()
  for (const r of rows) out.set(r.tournament_id, Number(r.n))
  return out
}
