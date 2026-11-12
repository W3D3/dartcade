// Named teams (migration 067). Who may do what, and the limits, are checked by api/teams.ts with
// shared/teams.ts; these are the queries. An invite counts while expires_at is in the future.
import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database, TeamsTable } from './schema.js'
import type { TeamInvite } from '../schema/lobby-ws.js'
import type { components } from '../schema/api.js'
import { PLACEMENT_MATCHES } from '../shared/ranked.js'
import type { TeamColor } from '../shared/teams.js'
import { x01AverageSince } from './ranked.js'
import { toAvatar } from './users.js'

type Team = components['schemas']['Team']
type UserRef = components['schemas']['UserRef']
export type TeamRow = Selectable<TeamsTable>

const userRef = (r: {
  id: string
  name: string
  avatar_kind: 'none' | 'preset' | 'upload'
  avatar_preset: string | null
  avatar_background: string | null
  avatar_version: number
}): UserRef => ({ id: r.id, name: r.name, avatar: toAvatar(r) })

const USER_COLUMNS = ['u.id', 'u.name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'] as const

/** Serializes the changes that count a player's teams (making one, joining one) for the transaction. */
export async function lockPlayerTeams(db: Kysely<Database>, userId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext('dartcade.teams.player.' || ${userId}))`.execute(db)
}

/** The team, locked for the transaction, so two changes can't both take its last place. */
export function lockTeam(db: Kysely<Database>, id: string): Promise<TeamRow | undefined> {
  return db.selectFrom('teams').selectAll().where('id', '=', id).forUpdate().executeTakeFirst()
}

export async function isMember(db: Kysely<Database>, teamId: string, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('team_members')
    .select('user_id')
    .where('team_id', '=', teamId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return row !== undefined
}

/** How many teams the player is in. */
export async function teamCount(db: Kysely<Database>, userId: string): Promise<number> {
  const row = await db
    .selectFrom('team_members')
    .select(eb => eb.fn.countAll<string>().as('n'))
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

export async function memberCount(db: Kysely<Database>, teamId: string): Promise<number> {
  const row = await db
    .selectFrom('team_members')
    .select(eb => eb.fn.countAll<string>().as('n'))
    .where('team_id', '=', teamId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

/** Who has a pending invite to the team. */
export async function inviteeIds(db: Kysely<Database>, teamId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('team_invites')
    .select('invitee_user_id')
    .where('team_id', '=', teamId)
    .where('expires_at', '>', sql<Date>`now()`)
    .execute()
  return rows.map(r => r.invitee_user_id)
}

/** Members and pending invites together: the places a team has used. */
export async function placesTaken(db: Kysely<Database>, teamId: string): Promise<number> {
  const row = await db
    .selectNoFrom(eb => [
      eb.selectFrom('team_members').select(eb.fn.countAll<string>().as('n')).where('team_id', '=', teamId).as('members'),
      eb
        .selectFrom('team_invites')
        .select(eb.fn.countAll<string>().as('n'))
        .where('team_id', '=', teamId)
        .where('expires_at', '>', sql<Date>`now()`)
        .as('invites'),
    ])
    .executeTakeFirstOrThrow()
  return Number(row.members) + Number(row.invites)
}

/** A new team with its captain as the first member (the captain's key is deferred to the commit). */
export async function insertTeam(
  db: Kysely<Database>,
  t: { id: string; name: string; tag: string; color: TeamColor; captainUserId: string },
): Promise<void> {
  await db.insertInto('teams').values({ id: t.id, name: t.name, tag: t.tag, color: t.color, captain_user_id: t.captainUserId }).execute()
  await db.insertInto('team_members').values({ team_id: t.id, user_id: t.captainUserId }).execute()
}

export async function updateTeam(
  db: Kysely<Database>,
  id: string,
  patch: { name?: string; tag?: string; color?: TeamColor },
): Promise<void> {
  await db.updateTable('teams').set(patch).where('id', '=', id).execute()
}

export async function deleteTeam(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('teams').where('id', '=', id).execute()
}

/** Invites the player; false when a pending invite is there already (an expired one is replaced). */
export async function insertInvite(
  db: Kysely<Database>,
  i: { id: string; teamId: string; inviteeUserId: string; inviterUserId: string; expiresAt: Date },
): Promise<boolean> {
  const row = await db
    .insertInto('team_invites')
    .values({ id: i.id, team_id: i.teamId, invitee_user_id: i.inviteeUserId, inviter_user_id: i.inviterUserId, expires_at: i.expiresAt })
    .onConflict(oc =>
      oc
        .columns(['team_id', 'invitee_user_id'])
        .doUpdateSet({ id: i.id, inviter_user_id: i.inviterUserId, created_at: sql<Date>`now()`, expires_at: i.expiresAt })
        .where('team_invites.expires_at', '<=', sql<Date>`now()`),
    )
    .returning('id')
    .executeTakeFirst()
  return row !== undefined
}

/** A pending invite; an expired one is gone. */
export function getInvite(db: Kysely<Database>, id: string) {
  return db
    .selectFrom('team_invites')
    .selectAll()
    .where('id', '=', id)
    .where('expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst()
}

export async function deleteInvite(db: Kysely<Database>, id: string): Promise<void> {
  await db.deleteFrom('team_invites').where('id', '=', id).execute()
}

/** The invite becomes a membership. */
export async function joinTeam(db: Kysely<Database>, inviteId: string, teamId: string, userId: string): Promise<void> {
  await db.deleteFrom('team_invites').where('id', '=', inviteId).execute()
  await db.insertInto('team_members').values({ team_id: teamId, user_id: userId }).execute()
}

export async function removeMember(db: Kysely<Database>, teamId: string, userId: string): Promise<void> {
  await db.deleteFrom('team_members').where('team_id', '=', teamId).where('user_id', '=', userId).execute()
}

export async function setCaptain(db: Kysely<Database>, teamId: string, userId: string): Promise<void> {
  await db.updateTable('teams').set({ captain_user_id: userId }).where('id', '=', teamId).execute()
}

/**
 * Before an account is deleted (its memberships go with it): each team it captains passes to the
 * member who joined longest ago, or is deleted when nobody else is in it.
 */
export async function releaseTeamsOf(db: Kysely<Database>, userId: string): Promise<void> {
  await db.transaction().execute(async trx => {
    const captained = await trx.selectFrom('teams').select('id').where('captain_user_id', '=', userId).forUpdate().execute()
    for (const { id } of captained) {
      const next = await trx
        .selectFrom('team_members')
        .select('user_id')
        .where('team_id', '=', id)
        .where('user_id', '<>', userId)
        .orderBy('joined_at')
        .orderBy('user_id')
        .executeTakeFirst()
      if (next) await setCaptain(trx, id, next.user_id)
      else await deleteTeam(trx, id)
    }
  })
}

/** The player's pending invites, newest first, as /ws/me and the Teams tab show them. */
export async function pendingInvitesFor(db: Kysely<Database>, userId: string): Promise<TeamInvite[]> {
  const invites = await db
    .selectFrom('team_invites as i')
    .innerJoin('teams as t', 't.id', 'i.team_id')
    .leftJoin('user as u', 'u.id', 'i.inviter_user_id')
    .select(['i.id', 'i.created_at', 'i.expires_at', 't.id as team_id', 't.name as team_name', 't.tag', 't.color', 't.captain_user_id'])
    .select(['u.id as inviter_id', 'u.name as inviter_name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'])
    .where('i.invitee_user_id', '=', userId)
    .where('i.expires_at', '>', sql<Date>`now()`)
    .orderBy('i.created_at', 'desc')
    .execute()
  const members = await membersOf(
    db,
    invites.map(i => i.team_id),
  )
  return invites.map(i => {
    const roster = ordered(members.get(i.team_id) ?? [], i.captain_user_id)
    return {
      id: i.id,
      team: { id: i.team_id, name: i.team_name, tag: i.tag, color: i.color },
      ...(i.inviter_id !== null && i.inviter_name !== null
        ? { inviter: { id: i.inviter_id, name: i.inviter_name, avatar: toAvatar(i) } }
        : {}),
      members: roster.slice(0, 4).map(m => m.user),
      memberCount: roster.length,
      createdAt: i.created_at.toISOString(),
      expiresAt: i.expires_at.toISOString(),
    }
  })
}

type Member = { user: UserRef; joinedAt: Date }

async function membersOf(db: Kysely<Database>, teamIds: string[]): Promise<Map<string, Member[]>> {
  const out = new Map<string, Member[]>()
  if (teamIds.length === 0) return out
  const rows = await db
    .selectFrom('team_members as m')
    .innerJoin('user as u', 'u.id', 'm.user_id')
    .select(['m.team_id', 'm.joined_at', ...USER_COLUMNS])
    .where('m.team_id', 'in', teamIds)
    .orderBy('m.joined_at')
    .orderBy('u.id')
    .execute()
  for (const r of rows) out.set(r.team_id, [...(out.get(r.team_id) ?? []), { user: userRef(r), joinedAt: r.joined_at }])
  return out
}

/** The captain first, the others in the order they joined. */
const ordered = (members: Member[], captainId: string): Member[] => [
  ...members.filter(m => m.user.id === captainId),
  ...members.filter(m => m.user.id !== captainId),
]

/** Each player's 1v1 ranked rating once their placement matches are done. */
async function ratingsOf(db: Kysely<Database>, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()
  const rows = await db
    .selectFrom('ranked_ratings')
    .select(['user_id', 'rating'])
    .where('mode', '=', '1v1')
    .where('user_id', 'in', userIds)
    .where('matches', '>=', PLACEMENT_MATCHES)
    .execute()
  return new Map(rows.map(r => [r.user_id, r.rating]))
}

const AVERAGE_DAYS = 30
const TOURNAMENTS_SHOWN = 10

/** The teams the player is in (the one they joined first first), as the Teams tab shows them. */
export async function teamsOf(db: Kysely<Database>, userId: string): Promise<Team[]> {
  const teams = await db
    .selectFrom('teams as t')
    .innerJoin('team_members as me', join => join.onRef('me.team_id', '=', 't.id').on('me.user_id', '=', userId))
    .selectAll('t')
    .orderBy('me.joined_at')
    .orderBy('t.id')
    .execute()
  const ids = teams.map(t => t.id)
  if (ids.length === 0) return []
  const [members, invites] = await Promise.all([
    membersOf(db, ids),
    db
      .selectFrom('team_invites as i')
      .innerJoin('user as u', 'u.id', 'i.invitee_user_id')
      .select(['i.id as invite_id', 'i.team_id', 'i.created_at', 'i.expires_at', ...USER_COLUMNS])
      .where('i.team_id', 'in', ids)
      .where('i.expires_at', '>', sql<Date>`now()`)
      .orderBy('i.created_at')
      .execute(),
  ])
  const memberIds = [...new Set([...members.values()].flat().map(m => m.user.id))]
  const [ratings, averages, entries, matches] = await Promise.all([
    ratingsOf(db, [...new Set([...memberIds, ...invites.map(i => i.id)])]),
    Promise.all(memberIds.map(async id => [id, await x01AverageSince(db, id, AVERAGE_DAYS)] as const)).then(a => new Map(a)),
    db
      .selectFrom('tournament_entries as e')
      .innerJoin('tournaments as t', 't.id', 'e.tournament_id')
      .select(['e.team_id', 'e.status as entry_status', 'e.final_place', 't.id', 't.name', 't.starts_at', 't.status', 't.created_at'])
      .where('e.team_id', 'in', ids)
      .orderBy(sql`coalesce(t.starts_at, t.created_at)`, 'desc')
      .execute(),
    db
      .selectFrom('tournament_matches as m')
      .innerJoin('tournament_entries as e', join =>
        join.on(eb => eb.or([eb('e.id', '=', eb.ref('m.entry_a_id')), eb('e.id', '=', eb.ref('m.entry_b_id'))])),
      )
      .select([
        'e.team_id',
        eb => eb.fn.countAll<string>().filterWhere('m.winner_entry_id', '=', eb.ref('e.id')).as('wins'),
        eb => eb.fn.countAll<string>().as('played'),
      ])
      .where('e.team_id', 'in', ids)
      .where('m.status', '=', 'finished')
      .where('m.outcome', '<>', 'bye')
      .groupBy('e.team_id')
      .execute(),
  ])

  return teams.map(t => {
    const roster = ordered(members.get(t.id) ?? [], t.captain_user_id)
    const own = entries.filter(e => e.team_id === t.id)
    const record = matches.find(m => m.team_id === t.id)
    const wins = Number(record?.wins ?? 0)
    const places = own.flatMap(e => (e.final_place === null ? [] : [e.final_place]))
    const memberAverages = roster.flatMap(m => {
      const a = averages.get(m.user.id)
      return a == null ? [] : [a]
    })
    return {
      id: t.id,
      name: t.name,
      tag: t.tag,
      color: t.color,
      captainUserId: t.captain_user_id,
      createdAt: t.created_at.toISOString(),
      members: roster.map(m => ({ user: m.user, joinedAt: m.joinedAt.toISOString(), rating: ratings.get(m.user.id) ?? null })),
      invites: invites
        .filter(i => i.team_id === t.id)
        .map(i => ({
          id: i.invite_id,
          user: userRef(i),
          createdAt: i.created_at.toISOString(),
          expiresAt: i.expires_at.toISOString(),
          rating: ratings.get(i.id) ?? null,
        })),
      record: {
        wins,
        losses: Number(record?.played ?? 0) - wins,
        tournaments: own.length,
        bestPlace: places.length === 0 ? null : Math.min(...places),
      },
      average: memberAverages.length === 0 ? null : memberAverages.reduce((a, b) => a + b, 0) / memberAverages.length,
      tournaments: own.slice(0, TOURNAMENTS_SHOWN).map(e => ({
        id: e.id,
        name: e.name,
        startsAt: e.starts_at?.toISOString() ?? null,
        status: e.status,
        entryStatus: e.entry_status,
        finalPlace: e.final_place,
      })),
    }
  })
}
