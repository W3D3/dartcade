import { sql, type Kysely, type NotNull } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import type { Award, DayTally } from '../progression/rules.js'
import { PERKS, levelOf, levelPerks, perk, streakPerks, type StreakState } from '../shared/progression.js'

const StatsSchema = z.record(z.string(), z.number()).catch({})

export type XpSeat = {
  seat: number
  userId: string | null
  controllerUserId: string | null
  bot: boolean
  placement: number
  forfeited: boolean
  stats: Record<string, number>
}
export type SeatDarts = { total: number; camera: number; oneEighties: number }
/** A seat's visit in the game itself (not the bull off), in order. */
export type SeatVisit = { visit: number; leg: number; segs: { n: number; m: number }[] }
/** A finished, counted game as XP sees it: the seats, each seat's darts, who had it rated. */
export type XpGame = {
  id: string
  gameId: string
  finishedAt: Date
  seats: XpSeat[]
  darts: Map<number, SeatDarts>
  /** Every seat's visits (challenges read them). */
  visits: Map<number, SeatVisit[]>
  rankedUserIds: Set<string>
  lobbyId: string | null
  config: unknown
}

const SegSchema = z.object({ number: z.number(), multiplier: z.number() }).catch({ number: 0, multiplier: 0 })

/** A finished game that still counts (not invalidated), with its result; undefined otherwise. */
export async function getXpGame(db: Kysely<Database>, id: string): Promise<XpGame | undefined> {
  const game = await db
    .selectFrom('game_sessions')
    .select(['id', 'game_id', 'finished_at', 'lobby_id', 'config'])
    .where('id', '=', id)
    .where('status', '=', 'finished')
    .where('invalidated_at', 'is', null)
    .where('finished_at', 'is not', null)
    .$narrowType<{ finished_at: NotNull }>()
    .executeTakeFirst()
  if (!game) return undefined
  const [players, darts, ranked, rawDarts] = await Promise.all([
    db
      .selectFrom('game_players')
      .select(['seat', 'user_id', 'controller_user_id', 'bot_level', 'placement', 'forfeited', 'stats'])
      .where('session_id', '=', id)
      .where('placement', 'is not', null)
      .$narrowType<{ placement: NotNull }>()
      .orderBy('seat')
      .execute(),
    sql<{ seat: number; total: number; camera: number; one_eighties: number }>`
      SELECT seat, sum(n)::int AS total, sum(camera)::int AS camera, count(*) FILTER (WHERE max180)::int AS one_eighties
      FROM (
        SELECT seat, visit, count(*) AS n, count(*) FILTER (WHERE source = 'camera') AS camera,
               count(*) = 3 AND bool_and((segment->>'multiplier')::int = 3 AND (segment->>'number')::int = 20) AS max180
        FROM game_darts WHERE session_id = ${id} AND phase = 'game'
        GROUP BY seat, visit
      ) v
      GROUP BY seat`.execute(db),
    db.selectFrom('ranked_results').select('user_id').where('session_id', '=', id).execute(),
    db
      .selectFrom('game_darts')
      .select(['seat', 'visit', 'leg', 'segment'])
      .where('session_id', '=', id)
      .where('phase', '=', 'game')
      .orderBy('visit')
      .orderBy('dart_index')
      .execute(),
  ])
  const visits = new Map<number, SeatVisit[]>()
  for (const d of rawDarts) {
    const seg = SegSchema.parse(d.segment)
    const list = visits.get(d.seat) ?? []
    let v = list.at(-1)
    if (v?.visit !== d.visit) {
      v = { visit: d.visit, leg: d.leg, segs: [] }
      list.push(v)
    }
    v.segs.push({ n: seg.number, m: seg.multiplier })
    visits.set(d.seat, list)
  }
  return {
    id: game.id,
    gameId: game.game_id,
    finishedAt: game.finished_at,
    seats: players.map(p => ({
      seat: p.seat,
      userId: p.user_id,
      controllerUserId: p.controller_user_id,
      bot: p.bot_level !== null,
      placement: p.placement,
      forfeited: p.forfeited,
      stats: StatsSchema.parse(p.stats),
    })),
    darts: new Map(darts.rows.map(r => [r.seat, { total: r.total, camera: r.camera, oneEighties: r.one_eighties }])),
    visits,
    rankedUserIds: new Set(ranked.map(r => r.user_id)),
    lobbyId: game.lobby_id,
    config: game.config,
  }
}

/** Finished games that still count, oldest first (the backfill). */
export async function finishedGameIds(db: Kysely<Database>): Promise<string[]> {
  const rows = await db
    .selectFrom('game_sessions')
    .select('id')
    .where('status', '=', 'finished')
    .where('invalidated_at', 'is', null)
    .where('finished_at', 'is not', null)
    .orderBy('finished_at')
    .orderBy('id')
    .execute()
  return rows.map(r => r.id)
}

/** Serialises XP writes per account, so a day's tally is read and extended by one game at a time. */
export async function lockUser(trx: Kysely<Database>, userId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.xp.' || ${userId}))`.execute(trx)
}

export async function userTimeZone(db: Kysely<Database>, userId: string): Promise<string | null> {
  const row = await db
    .selectFrom('user')
    .select(sql<string | null>`preferences->>'timeZone'`.as('tz'))
    .where('id', '=', userId)
    .executeTakeFirst()
  return row?.tz ?? null
}

/** What the account earned on `localDate` from other games than `sourceId`. */
export async function dayTally(db: Kysely<Database>, userId: string, localDate: string, sourceId: string): Promise<DayTally> {
  const row = await db
    .selectFrom('xp_ledger')
    .select([
      sql<number>`count(*) FILTER (WHERE kind = 'game')::int`.as('games'),
      sql<number>`count(*) FILTER (WHERE kind = 'game' AND (meta->>'manual')::boolean)::int`.as('manual_games'),
      sql<number>`coalesce(sum(amount) FILTER (WHERE kind = 'dart'), 0)::int`.as('dart_xp'),
    ])
    .where('user_id', '=', userId)
    .where('local_date', '=', localDate)
    .where('source_id', '!=', sourceId)
    .executeTakeFirstOrThrow()
  return { games: row.games, manualGames: row.manual_games, dartXp: row.dart_xp }
}

/** The account's best `key` in `mode` before game `excludeId`; null when it has none. */
export async function previousBest(
  db: Kysely<Database>,
  userId: string,
  mode: string,
  key: string,
  higher: boolean,
  excludeId: string,
): Promise<number | null> {
  const value = sql<number>`(gp.stats->>${key})::float8`
  const row = await db
    .selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .select((higher ? sql<number | null>`max(${value})` : sql<number | null>`min(${value})`).as('best'))
    .where('gp.user_id', '=', userId)
    .where('gp.placement', 'is not', null)
    .where('gs.game_id', '=', mode)
    .where('gs.status', '=', 'finished')
    .where('gs.invalidated_at', 'is', null)
    .where('gs.id', '!=', excludeId)
    .where(sql<boolean>`gp.stats ? ${key}`)
    .executeTakeFirst()
  return row?.best ?? null
}

export type LedgerLine = { kind: string; sourceType: string; amount: number; meta: Record<string, unknown> }

/** Writes the awards that aren't written yet; returns those. */
export async function insertAwards(
  db: Kysely<Database>,
  userId: string,
  sourceId: string,
  localDate: string,
  awards: Award[],
  at: Date,
): Promise<LedgerLine[]> {
  if (awards.length === 0) return []
  const rows = await db
    .insertInto('xp_ledger')
    .values(
      awards.map(a => ({
        user_id: userId,
        kind: a.kind,
        source_type: a.sourceType,
        source_id: a.sourceId ?? sourceId,
        amount: a.amount,
        local_date: localDate,
        meta: JSON.stringify(a.meta),
        created_at: at,
      })),
    )
    .onConflict(oc => oc.columns(['user_id', 'kind', 'source_type', 'source_id']).doNothing())
    .returning(['kind', 'source_type', 'amount', 'meta'])
    .execute()
  return rows.map(r => ({ kind: r.kind, sourceType: r.source_type, amount: r.amount, meta: r.meta }))
}

/** Adds `amount` to the account's total; returns the total before and after. */
export async function addXp(db: Kysely<Database>, userId: string, amount: number): Promise<{ before: number; after: number }> {
  const before = (await db.selectFrom('user_progress').select('xp_total').where('user_id', '=', userId).executeTakeFirst())?.xp_total ?? 0
  const after = before + amount
  await db
    .insertInto('user_progress')
    .values({ user_id: userId, xp_total: after, level: levelOf(after).level })
    .onConflict(oc => oc.column('user_id').doUpdateSet({ xp_total: after, level: levelOf(after).level, updated_at: new Date() }))
    .execute()
  return { before, after }
}

export async function getProgress(db: Kysely<Database>, userId: string): Promise<{ xp: number }> {
  const row = await db.selectFrom('user_progress').select('xp_total').where('user_id', '=', userId).executeTakeFirst()
  return { xp: row?.xp_total ?? 0 }
}

/** What the account was paid for game `sessionId`. */
export async function gameLines(db: Kysely<Database>, userId: string, sessionId: string): Promise<LedgerLine[]> {
  const rows = await db
    .selectFrom('xp_ledger')
    .select(['kind', 'source_type', 'amount', 'meta'])
    .where('user_id', '=', userId)
    // The daily bonus and a freeze are keyed by day; they name the game that paid them
    .where(eb => eb.or([eb('source_id', '=', sessionId), eb(sql<string>`meta->>'sessionId'`, '=', sessionId)]))
    .orderBy('id')
    .execute()
  return rows.map(r => ({ kind: r.kind, sourceType: r.source_type, amount: r.amount, meta: r.meta }))
}

/**
 * A game stopped counting (invalidated or deleted): what it paid is taken back and the totals are
 * summed again from the ledger. Runs inside `trx`.
 */
export async function revokeGameXp(trx: Kysely<Database>, sessionId: string): Promise<void> {
  const removed = await trx.deleteFrom('xp_ledger').where('source_id', '=', sessionId).returning('user_id').execute()
  for (const userId of new Set(removed.map(r => r.user_id))) {
    await lockUser(trx, userId)
    const { total } = await trx
      .selectFrom('xp_ledger')
      .select(sql<number>`coalesce(sum(amount), 0)::int`.as('total'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow()
    await trx
      .updateTable('user_progress')
      .set({ xp_total: total, level: levelOf(total).level, updated_at: new Date() })
      .where('user_id', '=', userId)
      .execute()
  }
}

export async function backfillDone(db: Kysely<Database>): Promise<boolean> {
  return (await db.selectFrom('progression_backfill').select('done_at').executeTakeFirst()) !== undefined
}

export async function markBackfillDone(db: Kysely<Database>): Promise<void> {
  await db.insertInto('progression_backfill').defaultValues().execute()
}

/** The account's day streak; a new account's has its one starting freeze. */
export async function getStreak(db: Kysely<Database>, userId: string): Promise<StreakState> {
  const row = await db
    .selectFrom('user_progress')
    .select(['streak_current', 'streak_best', sql<string | null>`streak_last_date::text`.as('last'), 'freezes'])
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row
    ? { current: row.streak_current, best: row.streak_best, lastDate: row.last, freezes: row.freezes }
    : { current: 0, best: 0, lastDate: null, freezes: 1 }
}

export async function saveStreak(db: Kysely<Database>, userId: string, s: StreakState): Promise<void> {
  const cols = { streak_current: s.current, streak_best: s.best, streak_last_date: s.lastDate, freezes: s.freezes }
  await db
    .insertInto('user_progress')
    .values({ user_id: userId, ...cols })
    .onConflict(oc => oc.column('user_id').doUpdateSet({ ...cols, updated_at: new Date() }))
    .execute()
}

/** The days in `[from, to]` the account played a qualifying game on, and the ones a freeze covered. */
export async function streakDays(
  db: Kysely<Database>,
  userId: string,
  from: string,
  to: string,
): Promise<{ played: string[]; frozen: string[] }> {
  const rows = await db
    .selectFrom('xp_ledger')
    .select(['kind', sql<string>`local_date::text`.as('day'), 'source_id'])
    .where('user_id', '=', userId)
    .where(eb =>
      eb.or([
        eb.and([eb('kind', '=', 'game'), eb('local_date', '>=', from), eb('local_date', '<=', to)]),
        eb.and([eb('kind', '=', 'freeze'), eb('source_id', '>=', from), eb('source_id', '<=', to)]),
      ]),
    )
    .execute()
  return {
    played: [...new Set(rows.filter(r => r.kind === 'game').map(r => r.day))],
    frozen: rows.filter(r => r.kind === 'freeze').map(r => r.source_id),
  }
}

/** Writes the unlocks the account doesn't have yet; returns those (perk ids). */
export async function unlock(db: Kysely<Database>, userId: string, perks: { id: string; source: string }[], at: Date): Promise<string[]> {
  if (perks.length === 0) return []
  const rows = await db
    .insertInto('user_unlocks')
    .values(perks.map(p => ({ user_id: userId, perk_id: p.id, source: p.source, unlocked_at: at })))
    .onConflict(oc => oc.columns(['user_id', 'perk_id']).doNothing())
    .returning('perk_id')
    .execute()
  return rows.map(r => r.perk_id)
}

/**
 * Every perk the account holds, in catalogue order: the rows unlocking wrote (a retired perk's row
 * is ignored), plus whatever its level and best streak reach now. Those are read from the totals
 * rather than only the rows, so a perk added to the catalogue later is held at once without a backfill.
 */
export async function unlockedPerks(db: Kysely<Database>, userId: string): Promise<string[]> {
  const [rows, progress] = await Promise.all([
    db.selectFrom('user_unlocks').select('perk_id').where('user_id', '=', userId).execute(),
    db.selectFrom('user_progress').select(['xp_total', 'streak_best']).where('user_id', '=', userId).executeTakeFirst(),
  ])
  const held = new Set([
    ...rows.map(r => r.perk_id),
    ...levelPerks(levelOf(progress?.xp_total ?? 0).level).map(p => p.id),
    ...streakPerks(progress?.streak_best ?? 0).map(p => p.id),
  ])
  return PERKS.filter(p => held.has(p.id)).map(p => p.id)
}

/** Ranked deeds that unlock perks: 10 ranked wins, a Gold rank (index 15, Gold I) in any mode. */
export async function rankedDeeds(db: Kysely<Database>, userId: string): Promise<{ wins: number; bestRank: number | null }> {
  const [wins, rank] = await Promise.all([
    db
      .selectFrom('ranked_results')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('user_id', '=', userId)
      .where('won', '=', true)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('ranked_ratings')
      .select(sql<number | null>`max(rank_index)`.as('best'))
      .where('user_id', '=', userId)
      .executeTakeFirst(),
  ])
  return { wins: wins.n, bestRank: rank?.best ?? null }
}

/** Whether the account holds perk `perkId`. */
export async function hasPerk(db: Kysely<Database>, userId: string, perkId: string): Promise<boolean> {
  return (await unlockedPerks(db, userId)).includes(perkId)
}

/** The pictures the account may wear: avatar preset ids. */
export async function unlockedPictures(db: Kysely<Database>, userId: string): Promise<string[]> {
  return (await unlockedPerks(db, userId)).filter(id => perk(id)?.kind === 'picture').map(id => id.slice('picture.'.length))
}
