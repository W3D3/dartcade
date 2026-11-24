// The games behind the admin Activity page's "Games played" subpage (`#/admin/activity/games`): one filter
// shared by the chart's day counts, the total, the table and the CSV, so they always describe the same games.
import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { Database } from './schema.js'
import { isRanked } from './adminGames.js'
import { groupBy } from '../util/groupBy.js'

export const NO_COUNTRY = 'none'
export const KINDS = ['any', 'ranked', 'unranked', 'tournament', 'lobby', 'local'] as const
export type Kind = (typeof KINDS)[number]

export type ActivityGamesFilter = {
  usersIn: string[]
  usersOut: string[]
  /** Country codes, or `none` for an account without a country. */
  countriesIn: string[]
  countriesOut: string[]
  /** `any`: a seat from the countries; `all`: every account seat is. */
  countryMatch: 'any' | 'all'
  minPlayers?: number
  maxPlayers?: number
  modes: string[]
  kind: Kind
  status: 'finished' | 'aborted' | 'all'
  from?: Date
  to?: Date
  includeInvalidated: boolean
}

/** A seat's account country is in `codes` (`none` counts the accounts with no country). */
function seatCountryIn(codes: string[]): RawBuilder<boolean> {
  const real = codes.filter(c => c !== NO_COUNTRY)
  const parts = [
    ...(real.length > 0 ? [sql`u.country in (${sql.join(real)})`] : []),
    ...(codes.includes(NO_COUNTRY) ? [sql`u.country is null`] : []),
  ]
  return parts.length === 0 ? sql<boolean>`false` : sql<boolean>`(${sql.join(parts, sql` or `)})`
}

/** A seat with an account (guests and bots have none) satisfying `cond`. */
const accountSeat = (cond: RawBuilder<boolean>) =>
  sql<boolean>`exists (select 1 from game_players p join "user" u on u.id = p.user_id where p.session_id = gs.id and ${cond})`

const playedBy = (ids: string[]) =>
  sql<boolean>`exists (select 1 from game_players p where p.session_id = gs.id and p.user_id in (${sql.join(ids)}))`

const seatCount = sql<number>`(select count(*) from game_players p where p.session_id = gs.id)`

/** The games matching the filter, as a builder on `game_sessions as gs` with no columns picked yet. */
function matching(db: Kysely<Database>, f: ActivityGamesFilter) {
  return db
    .selectFrom('game_sessions as gs')
    .where('gs.status', 'in', f.status === 'all' ? ['finished', 'aborted'] : [f.status])
    .$if(!f.includeInvalidated, q => q.where('gs.invalidated_at', 'is', null))
    .$if(f.modes.length > 0, q => q.where('gs.game_id', 'in', f.modes))
    .$if(f.from !== undefined, q => q.where('gs.created_at', '>=', f.from ?? new Date(0)))
    .$if(f.to !== undefined, q => q.where('gs.created_at', '<', f.to ?? new Date(0)))
    .$if(f.minPlayers !== undefined, q => q.where(sql<boolean>`${seatCount} >= ${f.minPlayers}`))
    .$if(f.maxPlayers !== undefined, q => q.where(sql<boolean>`${seatCount} <= ${f.maxPlayers}`))
    .$if(f.kind === 'ranked', q => q.where(sql<boolean>`${isRanked}`))
    .$if(f.kind === 'unranked', q => q.where(sql<boolean>`not ${isRanked}`))
    .$if(f.kind === 'tournament', q => q.where('gs.tournament_match_id', 'is not', null))
    .$if(f.kind === 'lobby', q => q.where('gs.lobby_id', 'is not', null))
    .$if(f.kind === 'local', q => q.where('gs.lobby_id', 'is', null).where('gs.tournament_match_id', 'is', null))
    .$if(f.usersIn.length > 0, q => q.where(playedBy(f.usersIn)))
    .$if(f.usersOut.length > 0, q => q.where(sql<boolean>`not ${playedBy(f.usersOut)}`))
    .$if(f.countriesIn.length > 0, q =>
      q.where(
        f.countryMatch === 'any'
          ? accountSeat(seatCountryIn(f.countriesIn))
          : sql<boolean>`${accountSeat(sql`true`)} and not ${accountSeat(sql`${seatCountryIn(f.countriesIn)} is not true`)}`,
      ),
    )
    .$if(f.countriesOut.length > 0, q => q.where(sql<boolean>`not ${accountSeat(seatCountryIn(f.countriesOut))}`))
}

const DAY_MS = 86_400_000
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
const dayOf = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS

export type ActivityGameRow = {
  id: string
  mode: string
  status: 'finished' | 'aborted'
  createdAt: Date
  finishedAt: Date | null
  ranked: boolean
  invalidated: boolean
  players: { name: string; userId: string | null; bot: boolean; country: string | null; placement: number | null }[]
}

/** One page of the matching games, newest first, with their seats. */
export async function listActivityGames(
  db: Kysely<Database>,
  f: ActivityGamesFilter,
  page: { offset: number; limit: number },
): Promise<ActivityGameRow[]> {
  const rows = await matching(db, f)
    .select([
      'gs.id',
      'gs.game_id',
      'gs.status',
      'gs.created_at',
      'gs.finished_at',
      'gs.invalidated_at',
      sql<boolean>`${isRanked}`.as('ranked'),
    ])
    .orderBy('gs.created_at', 'desc')
    .orderBy('gs.id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute()
  if (rows.length === 0) return []
  const seats = groupBy(
    await db
      .selectFrom('game_players as p')
      .leftJoin('user as u', 'u.id', 'p.user_id')
      .select(['p.session_id', 'p.name', 'p.user_id', 'p.bot_level', 'p.placement', 'u.country'])
      .where(
        'p.session_id',
        'in',
        rows.map(r => r.id),
      )
      .orderBy('p.session_id')
      .orderBy('p.seat')
      .execute(),
    r => r.session_id,
  )
  return rows.map(r => ({
    id: r.id,
    mode: r.game_id,
    status: r.status === 'aborted' ? 'aborted' : 'finished',
    createdAt: r.created_at,
    finishedAt: r.finished_at,
    ranked: r.ranked,
    invalidated: r.invalidated_at !== null,
    players: (seats.get(r.id) ?? []).map(s => ({
      name: s.name,
      userId: s.user_id,
      bot: s.bot_level !== null,
      country: s.country,
      placement: s.placement,
    })),
  }))
}

/** How many games match, and how many started on each UTC day (every day from the first to the last, zeros included). */
export async function activityGamesOverTime(
  db: Kysely<Database>,
  f: ActivityGamesFilter,
  now: number,
): Promise<{ total: number; perDay: { day: string; count: number }[] }> {
  const rows = await matching(db, f)
    .select([sql<string>`to_char(gs.created_at at time zone 'UTC', 'YYYY-MM-DD')`.as('day'), sql<string>`count(*)`.as('n')])
    .groupBy('day')
    .orderBy('day')
    .execute()
  const counts = new Map(rows.map(r => [r.day, Number(r.n)]))
  const first = rows[0] ? Date.parse(rows[0].day) : undefined
  const start = f.from ? dayOf(f.from.getTime()) : first
  if (start === undefined) return { total: 0, perDay: [] }
  const end = f.to ? dayOf(f.to.getTime() - 1) : dayOf(now)
  const perDay: { day: string; count: number }[] = []
  for (let t = start; t <= end; t += DAY_MS) perDay.push({ day: dayKey(t), count: counts.get(dayKey(t)) ?? 0 })
  return { total: rows.reduce((s, r) => s + Number(r.n), 0), perDay }
}

/** The names of the accounts a filter mentions, so a shared link can show its chips. */
export async function namesOf(db: Kysely<Database>, ids: string[]): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return []
  return db.selectFrom('user').select(['id', 'name']).where('id', 'in', ids).execute()
}
