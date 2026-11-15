// Guest claims (migration 072): a host's invites to friends to take over the guest seats of a
// finished game. The rules are in guestClaims/service.ts; these are the queries. A game_players seat
// is a guest when it has no account, is no bot and was not played for a tournament spot.
import type { Kysely, Transaction } from 'kysely'
import type { Database } from './schema.js'
import type { components } from '../schema/api.js'
import type { GuestClaimInvite } from '../schema/lobby-ws.js'
import { toAvatar } from './users.js'

type Db = Kysely<Database> | Transaction<Database>
type Seat = components['schemas']['GuestClaimSeat']

const USER_COLUMNS = ['u.id', 'u.name', 'u.avatar_kind', 'u.avatar_preset', 'u.avatar_background', 'u.avatar_version'] as const

export interface ClaimGame {
  id: string
  mode: string
  hostId: string | null
  finished: boolean
  invalidated: boolean
  finishedAt: Date | null
}

/** The game, locked when `lock` is set (accepting and inviting serialize on it). */
export async function claimGame(db: Db, gameId: string, lock = false): Promise<ClaimGame | undefined> {
  let q = db
    .selectFrom('game_sessions')
    .select(['id', 'game_id', 'owner_user_id', 'status', 'invalidated_at', 'finished_at'])
    .where('id', '=', gameId)
  if (lock) q = q.forUpdate()
  const r = await q.executeTakeFirst()
  return (
    r && {
      id: r.id,
      mode: r.game_id,
      hostId: r.owner_user_id,
      finished: r.status === 'finished',
      invalidated: r.invalidated_at !== null,
      finishedAt: r.finished_at,
    }
  )
}

export interface GuestSeat {
  seat: number
  name: string
  placement: number | null
}

/** The seats nobody has taken over: no account, no bot, no tournament spot. */
export async function guestSeats(db: Db, gameId: string): Promise<GuestSeat[]> {
  const rows = await db
    .selectFrom('game_players')
    .select(['seat', 'name', 'placement'])
    .where('session_id', '=', gameId)
    .where('user_id', 'is', null)
    .where('bot_level', 'is', null)
    .where('tournament_player_id', 'is', null)
    .orderBy('seat')
    .execute()
  return rows
}

export async function isSeated(db: Db, gameId: string, userId: string): Promise<boolean> {
  const r = await db
    .selectFrom('game_players')
    .select('seat')
    .where('session_id', '=', gameId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  return r !== undefined
}

/** The guest seats with the friend each one waits on (null: nobody asked yet). */
export async function seatsWithInvites(db: Db, gameId: string): Promise<Seat[]> {
  const [seats, invites] = await Promise.all([
    guestSeats(db, gameId),
    db
      .selectFrom('game_guest_claims as c')
      .innerJoin('user as u', 'u.id', 'c.invited_user_id')
      .select(['c.id as claim_id', 'c.seat', 'c.created_at', ...USER_COLUMNS])
      .where('c.game_session_id', '=', gameId)
      .where('c.status', '=', 'pending')
      .execute(),
  ])
  return seats.map(s => {
    const i = invites.find(x => x.seat === s.seat)
    return {
      ...s,
      invite: i ? { id: i.claim_id, createdAt: i.created_at.toISOString(), user: { id: i.id, name: i.name, avatar: toAvatar(i) } } : null,
    }
  })
}

export interface Claim {
  id: string
  gameId: string
  seat: number
  invitedUserId: string
  invitedBy: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
}

const claimOf = (r: {
  id: string
  game_session_id: string
  seat: number
  invited_user_id: string
  invited_by: string
  status: Claim['status']
}): Claim => ({
  id: r.id,
  gameId: r.game_session_id,
  seat: r.seat,
  invitedUserId: r.invited_user_id,
  invitedBy: r.invited_by,
  status: r.status,
})

export async function getClaim(db: Db, id: string): Promise<Claim | undefined> {
  const r = await db.selectFrom('game_guest_claims').selectAll().where('id', '=', id).executeTakeFirst()
  return r && claimOf(r)
}

export async function pendingClaimOfSeat(db: Db, gameId: string, seat: number): Promise<Claim | undefined> {
  const r = await db
    .selectFrom('game_guest_claims')
    .selectAll()
    .where('game_session_id', '=', gameId)
    .where('seat', '=', seat)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  return r && claimOf(r)
}

/** The friend's pending invite for another seat of the game, if any. */
export async function pendingClaimOfFriend(db: Db, gameId: string, userId: string): Promise<Claim | undefined> {
  const r = await db
    .selectFrom('game_guest_claims')
    .selectAll()
    .where('game_session_id', '=', gameId)
    .where('invited_user_id', '=', userId)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  return r && claimOf(r)
}

export async function insertClaim(
  db: Db,
  c: { id: string; gameId: string; seat: number; invitedUserId: string; invitedBy: string },
): Promise<void> {
  await db
    .insertInto('game_guest_claims')
    .values({
      id: c.id,
      game_session_id: c.gameId,
      seat: c.seat,
      invited_user_id: c.invitedUserId,
      invited_by: c.invitedBy,
      status: 'pending',
    })
    .execute()
}

/** Ends a pending claim as accepted, declined or cancelled; false when it was not pending any more. */
export async function answerClaim(db: Db, id: string, status: 'accepted' | 'declined' | 'cancelled'): Promise<boolean> {
  const r = await db
    .updateTable('game_guest_claims')
    .set({ status, answered_at: new Date() })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  return r.numUpdatedRows > 0n
}

/** The invites waiting for the user's answer, newest first, with what they may see of the game. */
export async function pendingClaimsFor(db: Db, userId: string): Promise<GuestClaimInvite[]> {
  const rows = await db
    .selectFrom('game_guest_claims as c')
    .innerJoin('game_sessions as g', 'g.id', 'c.game_session_id')
    .innerJoin('game_players as p', join => join.onRef('p.session_id', '=', 'c.game_session_id').onRef('p.seat', '=', 'c.seat'))
    .innerJoin('user as u', 'u.id', 'c.invited_by')
    .select(['c.id as claim_id', 'c.game_session_id', 'c.created_at', 'g.game_id', 'g.finished_at', 'g.created_at as started_at'])
    .select(['p.name as seat_name', 'p.placement', ...USER_COLUMNS])
    .where('c.invited_user_id', '=', userId)
    .where('c.status', '=', 'pending')
    .where('g.invalidated_at', 'is', null)
    .orderBy('c.created_at', 'desc')
    .execute()
  return rows.map(r => ({
    id: r.claim_id,
    gameId: r.game_session_id,
    mode: r.game_id,
    playedAt: (r.finished_at ?? r.started_at).toISOString(),
    host: { id: r.id, name: r.name, avatar: toAvatar(r) },
    seatName: r.seat_name,
    placement: r.placement,
    createdAt: r.created_at.toISOString(),
  }))
}
