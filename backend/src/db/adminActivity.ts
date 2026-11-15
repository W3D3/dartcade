// The numbers behind the admin Activity page (`#/admin/activity`): signups, games and darts counted from
// the tables that already hold them. Day buckets are UTC; nothing here names a person.
import { sql, type Kysely } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'

export type ActivityStats = Pick<
  components['schemas']['AdminActivity'],
  'last24h' | 'newUsers' | 'newUsersPerDay' | 'gamesPerDay' | 'busiest' | 'highlights'
> & { tournaments: components['schemas']['AdminActivity']['happeningNow']['tournaments']; manualDartShare: number | null }

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** The UTC day starting `back` days before the one `now` is in. */
const dayStart = (now: number, back: number): Date => new Date(Math.floor(now / DAY_MS) * DAY_MS - back * DAY_MS)
const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

export async function activityStats(db: Kysely<Database>, days: number, now: number): Promise<ActivityStats> {
  const since = dayStart(now, days - 1)
  const day = new Date(now - 24 * HOUR_MS)
  const week = new Date(now - 7 * DAY_MS)
  const fortnight = new Date(now - 14 * DAY_MS)
  const month = new Date(now - 28 * DAY_MS)
  const utcDay = (col: string) => sql<string>`to_char(${sql.ref(col)} at time zone 'UTC', 'YYYY-MM-DD')`
  const count = sql<string>`count(*)`

  const [signups, finished, hours, games24, players24, newUsers, ones, achievements, teams, darts, tournaments] = await Promise.all([
    db
      .selectFrom('user')
      .select([utcDay('createdAt').as('day'), count.as('n')])
      .where('createdAt', '>=', since)
      .groupBy('day')
      .execute(),
    db
      .selectFrom('game_sessions')
      .select([utcDay('created_at').as('day'), 'game_id', count.as('n')])
      .where('status', '=', 'finished')
      .where('invalidated_at', 'is', null)
      .where('created_at', '>=', since)
      .groupBy(['day', 'game_id'])
      .execute(),
    db
      .selectFrom('game_sessions')
      .select([
        sql<number>`extract(isodow from created_at at time zone 'UTC')::int`.as('dow'),
        sql<number>`extract(hour from created_at at time zone 'UTC')::int`.as('hour'),
        count.as('n'),
      ])
      .where('status', '=', 'finished')
      .where('invalidated_at', 'is', null)
      .where('created_at', '>=', month)
      .groupBy(['dow', 'hour'])
      .execute(),
    db
      .selectFrom('game_sessions')
      .select(count.as('n'))
      .where('status', '=', 'finished')
      .where('invalidated_at', 'is', null)
      .where('finished_at', '>=', day)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('game_players as p')
      .innerJoin('game_sessions as s', 's.id', 'p.session_id')
      .select(sql<string>`count(distinct p.user_id)`.as('n'))
      .where('s.created_at', '>=', day)
      .where('s.invalidated_at', 'is', null)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('user')
      .select([
        sql<string>`count(*) filter (where "createdAt" >= ${week})`.as('last7d'),
        sql<string>`count(*) filter (where "createdAt" < ${week})`.as('previous7d'),
      ])
      .where('createdAt', '>=', fortnight)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('friend_activity')
      .select(count.as('n'))
      .where('kind', '=', 'one_eighty')
      .where('created_at', '>=', day)
      .executeTakeFirstOrThrow(),
    db.selectFrom('user_achievements').select(count.as('n')).where('tier_at', '>=', day).executeTakeFirstOrThrow(),
    db.selectFrom('teams').select(count.as('n')).where('created_at', '>=', week).executeTakeFirstOrThrow(),
    db
      .selectFrom('game_darts as d')
      .innerJoin('game_sessions as s', 's.id', 'd.session_id')
      .select([sql<string>`count(*) filter (where d.source = 'user')`.as('manual'), count.as('total')])
      .where('s.created_at', '>=', day)
      .where('d.source', 'in', ['user', 'board'])
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('tournaments as t')
      .select([
        't.id',
        't.name',
        't.kind',
        't.status',
        eb =>
          eb
            .selectFrom('tournament_entries as e')
            .select(sql<string>`count(*)`.as('n'))
            .whereRef('e.tournament_id', '=', 't.id')
            .as('entries'),
      ])
      .where('t.status', 'in', ['check_in', 'running'])
      .orderBy('t.started_at', 'desc')
      .limit(5)
      .execute(),
  ])

  const dayKeys = Array.from({ length: days }, (_, i) => dayKey(dayStart(now, days - 1 - i)))
  const signupsBy = new Map(signups.map(r => [r.day, Number(r.n)]))
  const perDay: Record<string, number>[] = dayKeys.map(() => ({}))
  const totals = new Map<string, number>()
  for (const r of finished) {
    const i = dayKeys.indexOf(r.day)
    if (i < 0) continue
    perDay[i][r.game_id] = Number(r.n)
    totals.set(r.game_id, (totals.get(r.game_id) ?? 0) + Number(r.n))
  }
  const busiest = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const r of hours) busiest[r.dow - 1][r.hour] = Number(r.n)
  const total = Number(darts.total)

  return {
    last24h: { players: Number(players24.n), games: Number(games24.n), oneEighties: Number(ones.n) },
    newUsers: { last7d: Number(newUsers.last7d), previous7d: Number(newUsers.previous7d) },
    newUsersPerDay: dayKeys.map(k => signupsBy.get(k) ?? 0),
    gamesPerDay: { modes: [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0)), perDay },
    busiest,
    highlights: { achievementsUnlocked24h: Number(achievements.n), teamsCreated7d: Number(teams.n) },
    manualDartShare: total === 0 ? null : Number(darts.manual) / total,
    tournaments: tournaments.map(t => ({
      id: t.id,
      name: t.name,
      official: t.kind === 'official',
      status: t.status === 'check_in' ? 'check_in' : 'running',
      entries: Number(t.entries ?? 0),
    })),
  }
}
