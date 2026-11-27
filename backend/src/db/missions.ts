// Missions, their best runs and reports (migration 078). Who sees a mission is one rule, `canSee`, with
// its SQL twin `visibleTo` for the lists; moderator actions write an admin_audit row, like minigolf's.
import { sql, type Kysely } from 'kysely'
import { ulid } from 'ulid'
import { z } from 'zod'
import type { Database } from './schema.js'
import { compareRuns, sameRules, type RunResult } from '../shared/missions/highscores.js'
import { MissionSchema, type Difficulty, type Mission, type MissionVisibility } from '../shared/missions/types.js'

export type MissionRow = {
  id: string
  /** null: official. */
  ownerUserId: string | null
  authorName: string | null
  visibility: MissionVisibility
  mission: Mission
  hiddenAt: Date | null
  hiddenReason: string | null
  createdAt: Date
  updatedAt: Date
}

/** The signed-in user as the mission rules see them. */
export type MissionViewer = { id: string; moderator: boolean; admin: boolean; friendIds: ReadonlySet<string> }

/**
 * Who may see a mission: its author always; a hidden one only moderators; an official or public one
 * everyone; a friends one the author's accepted friends; a private one nobody else.
 */
export function canSee(m: Pick<MissionRow, 'ownerUserId' | 'visibility' | 'hiddenAt'>, v: MissionViewer): boolean {
  if (m.ownerUserId === v.id) return true
  if (m.hiddenAt !== null) return v.moderator
  if (m.ownerUserId === null || m.visibility === 'public') return true
  return m.visibility === 'friends' && v.friendIds.has(m.ownerUserId)
}

/** Who may change or delete a mission: its author; an official one, admins. */
export const canWrite = (m: Pick<MissionRow, 'ownerUserId'>, v: MissionViewer): boolean =>
  m.ownerUserId === null ? v.admin : m.ownerUserId === v.id

// canSee as SQL for the lists, which leave hidden missions out (but the viewer's own)
const visibleTo = (v: MissionViewer) =>
  sql<boolean>`(m.owner_user_id = ${v.id} OR (m.hidden_at IS NULL AND (m.owner_user_id IS NULL OR m.visibility = 'public'
    OR (m.visibility = 'friends' AND m.owner_user_id = ANY(${[...v.friendIds]}::text[])))))`

// A mission's plays: its games but the test runs
const plays = sql<number>`(SELECT count(*)::int FROM game_sessions g
  WHERE g.game_id = 'mission' AND g.config ->> 'missionId' = m.id AND g.config ->> 'test' = 'false')`

const rows = (db: Kysely<Database>) =>
  db
    .selectFrom('missions as m')
    .leftJoin('user as u', 'u.id', 'm.owner_user_id')
    .select([
      'm.id',
      'm.owner_user_id',
      'm.visibility',
      'm.definition',
      'm.hidden_at',
      'm.hidden_reason',
      'm.created_at',
      'm.updated_at',
      'u.name as author_name',
    ])

type Selected = Awaited<ReturnType<ReturnType<typeof rows>['execute']>>[number]

// A stored definition that no longer parses (a rule tightened since) is left out
function toRow(r: Selected): MissionRow | null {
  const mission = MissionSchema.safeParse(r.definition)
  if (!mission.success) return null
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    authorName: r.author_name,
    visibility: r.visibility,
    mission: mission.data,
    hiddenAt: r.hidden_at,
    hiddenReason: r.hidden_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getMission(db: Kysely<Database>, id: string): Promise<MissionRow | null> {
  const r = await rows(db).where('m.id', '=', id).executeTakeFirst()
  return r ? toRow(r) : null
}

export type MissionFilter = 'all' | 'mine' | 'friends' | 'popular' | 'completed'

export type Best = RunResult & { userId: string; name: string; achievedAt: Date }

export type MissionCard = MissionRow & {
  plays: number
  /** The viewer's best completed run. */
  yourBest: Best | null
  /** The best of the viewer's friends. */
  friendsBest: Best | null
  /** The viewer's finished games of it (completed, failed, out of time or given up), test runs left out. */
  tries: number
}

const LIST_LIMIT = 100

/** The missions the viewer may see, as list cards; Popular by plays, the rest the latest changed first. */
export async function listMissions(
  db: Kysely<Database>,
  v: MissionViewer,
  filter: MissionFilter,
  difficulty?: Difficulty,
): Promise<MissionCard[]> {
  let q = rows(db).select(plays.as('plays')).where(visibleTo(v))
  if (filter === 'mine') q = q.where('m.owner_user_id', '=', v.id)
  if (filter === 'friends') q = q.where(sql<boolean>`m.owner_user_id = ANY(${[...v.friendIds]}::text[])`)
  if (filter === 'completed')
    q = q.where(eb =>
      eb.exists(
        eb.selectFrom('mission_bests as b').select('b.user_id').whereRef('b.mission_id', '=', 'm.id').where('b.user_id', '=', v.id),
      ),
    )
  if (difficulty) q = q.where(sql<boolean>`m.definition ->> 'difficulty' = ${difficulty}`)
  q = filter === 'popular' ? q.orderBy('plays', 'desc').orderBy('m.updated_at', 'desc') : q.orderBy('m.updated_at', 'desc')
  const found = (await q.limit(LIST_LIMIT).execute()).flatMap(r => {
    const row = toRow(r)
    return row ? [{ ...row, plays: r.plays }] : []
  })
  return withBests(db, v, found)
}

/** Each card's best of the viewer and of the viewer's friends. */
async function withBests(db: Kysely<Database>, v: MissionViewer, missions: (MissionRow & { plays: number })[]): Promise<MissionCard[]> {
  if (missions.length === 0) return []
  const ids = missions.map(m => m.id)
  const [bests, tries] = await Promise.all([bestsOf(db, ids, [v.id, ...v.friendIds]), triesOf(db, ids, v.id)])
  return missions.map(m => {
    const mine = bests.filter(b => b.missionId === m.id)
    const friends = mine.filter(b => b.userId !== v.id).sort((a, b) => compareRuns(m.mission.rankBy, a, b))
    return { ...m, yourBest: mine.find(b => b.userId === v.id) ?? null, friendsBest: friends[0] ?? null, tries: tries.get(m.id) ?? 0 }
  })
}

// How often the user finished a game of each mission: the bests keep only completions
async function triesOf(db: Kysely<Database>, missionIds: string[], userId: string): Promise<Map<string, number>> {
  const found = await db
    .selectFrom('game_sessions as g')
    .innerJoin('game_players as p', 'p.session_id', 'g.id')
    .select([sql<string>`g.config ->> 'missionId'`.as('missionId'), sql<number>`count(DISTINCT g.id)::int`.as('n')])
    .where('g.game_id', '=', 'mission')
    .where('g.status', '=', 'finished')
    .where(sql<boolean>`g.config ->> 'test' = 'false'`)
    .where(sql<boolean>`g.config ->> 'missionId' = ANY(${missionIds}::text[])`)
    .where('p.user_id', '=', userId)
    .groupBy(sql`g.config ->> 'missionId'`)
    .execute()
  return new Map(found.map(r => [r.missionId, r.n]))
}

async function bestsOf(db: Kysely<Database>, missionIds: string[], userIds: string[]): Promise<(Best & { missionId: string })[]> {
  const found = await db
    .selectFrom('mission_bests as b')
    .innerJoin('user as u', 'u.id', 'b.user_id')
    .select(['b.mission_id', 'b.user_id', 'u.name', 'b.time_ms', 'b.darts', 'b.achieved_at'])
    .where('b.mission_id', 'in', missionIds)
    .where('b.user_id', 'in', userIds)
    .execute()
  return found.map(b => ({
    missionId: b.mission_id,
    userId: b.user_id,
    name: b.name,
    timeMs: b.time_ms,
    darts: b.darts,
    achievedAt: b.achieved_at,
  }))
}

/** These missions as cards for the viewer (who may see them), in the order of `ids`. */
export async function cardsOf(db: Kysely<Database>, v: MissionViewer, ids: string[]): Promise<MissionCard[]> {
  if (ids.length === 0) return []
  const found = (await rows(db).select(plays.as('plays')).where('m.id', 'in', ids).execute()).flatMap(r => {
    const row = toRow(r)
    return row ? [{ ...row, plays: r.plays }] : []
  })
  const order = new Map(ids.map((id, i) => [id, i]))
  return withBests(
    db,
    v,
    found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
  )
}

const HIGHSCORES = 10

/** A mission's best runs, best first: one per player. */
export async function highscores(db: Kysely<Database>, m: Pick<MissionRow, 'id' | 'mission'>, limit = HIGHSCORES): Promise<Best[]> {
  const found = await db
    .selectFrom('mission_bests as b')
    .innerJoin('user as u', 'u.id', 'b.user_id')
    .select(['b.user_id', 'u.name', 'b.time_ms', 'b.darts', 'b.achieved_at'])
    .where('b.mission_id', '=', m.id)
    .orderBy(m.mission.rankBy === 'darts' ? 'b.darts' : 'b.time_ms')
    .orderBy(m.mission.rankBy === 'darts' ? 'b.time_ms' : 'b.darts')
    .limit(limit)
    .execute()
  return found.map(b => ({ userId: b.user_id, name: b.name, timeMs: b.time_ms, darts: b.darts, achievedAt: b.achieved_at }))
}

/** Each of `userIds`' own best run of the mission, null for one without (every id is a key): a game's start. */
export async function ownBests(db: Kysely<Database>, missionId: string, userIds: string[]): Promise<Record<string, RunResult | null>> {
  const found = userIds.length === 0 ? [] : await bestsOf(db, [missionId], userIds)
  return Object.fromEntries(
    userIds.map(id => {
      const b = found.find(f => f.userId === id)
      return [id, b ? { timeMs: b.timeMs, darts: b.darts } : null]
    }),
  )
}

/** Missions the user wrote. */
export async function ownedCount(db: Kysely<Database>, userId: string): Promise<number> {
  const { n } = await db
    .selectFrom('missions')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('owner_user_id', '=', userId)
    .executeTakeFirstOrThrow()
  return n
}

export async function createMission(
  db: Kysely<Database>,
  ownerUserId: string | null,
  mission: Mission,
  visibility: MissionVisibility,
): Promise<string> {
  const id = ulid()
  await db
    .insertInto('missions')
    .values({ id, owner_user_id: ownerUserId, visibility, definition: JSON.stringify(mission) })
    .execute()
  return id
}

/** Who owns a mission afterwards, when a save changes it: an admin's promotion to or demotion from official. */
export type OwnerChange = { ownerUserId: string | null; adminId: string }

/**
 * Saves the mission; a change to its rules (more than its name and description) clears its highscores.
 * With an owner change (null: official) the mission moves too, closes its reports and writes an admin_audit row.
 */
export async function updateMission(
  db: Kysely<Database>,
  id: string,
  mission: Mission,
  visibility: MissionVisibility,
  change?: OwnerChange,
): Promise<void> {
  await db.transaction().execute(async trx => {
    const before = await trx.selectFrom('missions').select('definition').where('id', '=', id).forUpdate().executeTakeFirst()
    const old = MissionSchema.safeParse(before?.definition)
    await trx
      .updateTable('missions')
      .set({
        definition: JSON.stringify(mission),
        visibility,
        updated_at: new Date(),
        ...(change && { owner_user_id: change.ownerUserId }),
      })
      .where('id', '=', id)
      .execute()
    if (!old.success || !sameRules(old.data, mission)) await trx.deleteFrom('mission_bests').where('mission_id', '=', id).execute()
    if (!change) return
    // An official mission is not reportable, so reports on a mission that becomes one are moot
    if (change.ownerUserId === null) await closeReports(trx, id)
    await trx
      .insertInto('admin_audit')
      .values({
        admin_user_id: change.adminId,
        action: change.ownerUserId === null ? 'mission.official' : 'mission.unofficial',
        target: id,
        detail: JSON.stringify({ ownerId: change.ownerUserId }),
      })
      .execute()
  })
}

export async function deleteMission(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('missions').where('id', '=', id).execute()
}

/** Keeps the run if it beats the player's best (or is their first); true when it did. */
export async function recordBest(
  db: Kysely<Database>,
  m: Pick<MissionRow, 'id' | 'mission'>,
  userId: string,
  run: RunResult,
  sessionId: string,
  at: Date,
): Promise<boolean> {
  // Row comparison: (time, darts) or (darts, time) is the ranking
  const better =
    m.mission.rankBy === 'darts'
      ? sql<boolean>`(excluded.darts, excluded.time_ms) < (mission_bests.darts, mission_bests.time_ms)`
      : sql<boolean>`(excluded.time_ms, excluded.darts) < (mission_bests.time_ms, mission_bests.darts)`
  const row = await db
    .insertInto('mission_bests')
    .values({ mission_id: m.id, user_id: userId, time_ms: run.timeMs, darts: run.darts, session_id: sessionId, achieved_at: at })
    .onConflict(oc =>
      oc
        .columns(['mission_id', 'user_id'])
        .doUpdateSet(eb => ({
          time_ms: eb.ref('excluded.time_ms'),
          darts: eb.ref('excluded.darts'),
          session_id: eb.ref('excluded.session_id'),
          achieved_at: eb.ref('excluded.achieved_at'),
        }))
        .where(better),
    )
    .returning('user_id')
    .executeTakeFirst()
  return row !== undefined
}

/** Files the report; 'duplicate' if this person has an open report on the mission already. */
export async function reportMission(
  db: Kysely<Database>,
  missionId: string,
  reporterId: string,
  reason: string,
): Promise<'ok' | 'duplicate'> {
  const row = await db
    .insertInto('mission_reports')
    .values({ id: ulid(), mission_id: missionId, reporter_user_id: reporterId, reason })
    .onConflict(oc => oc.columns(['mission_id', 'reporter_user_id']).where('dismissed_at', 'is', null).doNothing())
    .returning('id')
    .executeTakeFirst()
  return row ? 'ok' : 'duplicate'
}

export type MissionReport = { reporterName: string | null; reason: string; createdAt: Date }

/** Missions with open reports and their reports, the most reported first. */
export async function listReports(db: Kysely<Database>): Promise<{ missionId: string; reports: MissionReport[] }[]> {
  const found = await db
    .selectFrom('mission_reports as r')
    .leftJoin('user as u', 'u.id', 'r.reporter_user_id')
    .select(['r.mission_id', 'r.reason', 'r.created_at', 'u.name as reporter_name'])
    .where('r.dismissed_at', 'is', null)
    .orderBy('r.created_at')
    .execute()
  const byMission = new Map<string, MissionReport[]>()
  for (const r of found)
    byMission.set(r.mission_id, [
      ...(byMission.get(r.mission_id) ?? []),
      { reporterName: r.reporter_name, reason: r.reason, createdAt: r.created_at },
    ])
  return [...byMission].map(([missionId, reports]) => ({ missionId, reports })).sort((a, b) => b.reports.length - a.reports.length)
}

/** The ids of the missions a moderator hid, newest first. */
export async function hiddenMissionIds(db: Kysely<Database>): Promise<string[]> {
  const found = await db.selectFrom('missions').select('id').where('hidden_at', 'is not', null).orderBy('hidden_at', 'desc').execute()
  return found.map(r => r.id)
}

/**
 * One moderator action on a player's mission (official ones are the admins' own): the mission is
 * locked, and the action and its admin_audit row run in one transaction.
 */
async function moderate(
  db: Kysely<Database>,
  moderatorId: string,
  id: string,
  action: string,
  act: (trx: Kysely<Database>) => Promise<Record<string, unknown>>,
): Promise<'ok' | 'missing'> {
  return db.transaction().execute(async trx => {
    const row = await trx.selectFrom('missions').select('owner_user_id').where('id', '=', id).forUpdate().executeTakeFirst()
    if (!row?.owner_user_id) return 'missing'
    const detail = await act(trx)
    await trx
      .insertInto('admin_audit')
      .values({ admin_user_id: moderatorId, action, target: id, detail: JSON.stringify({ ownerId: row.owner_user_id, ...detail }) })
      .execute()
    return 'ok'
  })
}

const closeReports = (db: Kysely<Database>, id: string) =>
  db
    .updateTable('mission_reports')
    .set({ dismissed_at: sql<Date>`now()` })
    .where('mission_id', '=', id)
    .where('dismissed_at', 'is', null)
    .execute()

/** Hides a mission from everyone but moderators and its author (who sees the reason); closes its reports. */
export const hideMission = (db: Kysely<Database>, moderatorId: string, id: string, reason: string) =>
  moderate(db, moderatorId, id, 'mission.hide', async trx => {
    await trx.updateTable('missions').set({ hidden_at: new Date(), hidden_reason: reason }).where('id', '=', id).execute()
    await closeReports(trx, id)
    return { reason }
  })

export const restoreMission = (db: Kysely<Database>, moderatorId: string, id: string) =>
  moderate(db, moderatorId, id, 'mission.restore', async trx => {
    await trx.updateTable('missions').set({ hidden_at: null, hidden_reason: null }).where('id', '=', id).execute()
    return {}
  })

export const dismissMissionReports = (db: Kysely<Database>, moderatorId: string, id: string) =>
  moderate(db, moderatorId, id, 'mission.dismiss', async trx => {
    await closeReports(trx, id)
    return {}
  })

/** A finished mission game as the rewards read it: each seat with an account and its stored result. */
export type FinishedMissionGame = {
  sessionId: string
  missionId: string
  test: boolean
  /** The mission as it was played: the config's snapshot, whatever edits came since. */
  mission: Mission
  finishedAt: Date
  seats: { userId: string; completed: boolean; run: RunResult }[]
}

export async function finishedMissionGame(db: Kysely<Database>, sessionId: string): Promise<FinishedMissionGame | null> {
  const game = await db
    .selectFrom('game_sessions')
    .select(['config', 'finished_at'])
    .where('id', '=', sessionId)
    .where('game_id', '=', 'mission')
    .where('status', '=', 'finished')
    .executeTakeFirst()
  const config = FinishedConfig.safeParse(game?.config)
  if (!game?.finished_at || !config.success) return null
  const players = await db
    .selectFrom('game_players')
    .select(['user_id', 'stats'])
    .where('session_id', '=', sessionId)
    .where('user_id', 'is not', null)
    .orderBy('seat')
    .execute()
  return {
    sessionId,
    missionId: config.data.missionId,
    test: config.data.test,
    mission: config.data.mission,
    finishedAt: game.finished_at,
    seats: players.flatMap(p => {
      const stats = SeatStats.safeParse(p.stats)
      return p.user_id !== null && stats.success
        ? [{ userId: p.user_id, completed: stats.data.completed === 1, run: { timeMs: stats.data.timeMs, darts: stats.data.darts } }]
        : []
    }),
  }
}

const FinishedConfig = z.object({ missionId: z.string(), test: z.boolean(), mission: MissionSchema })
const SeatStats = z.object({ completed: z.number(), timeMs: z.number(), darts: z.number() })

/** Mission rewards the user was paid on their local day `localDate`. */
export async function missionRewardsOn(db: Kysely<Database>, userId: string, localDate: string): Promise<number> {
  const { n } = await db
    .selectFrom('xp_ledger')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .where('kind', '=', 'mission')
    .where('local_date', '=', localDate)
    .executeTakeFirstOrThrow()
  return n
}
