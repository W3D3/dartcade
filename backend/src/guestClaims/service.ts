// Guest claims: after a game, its host asks a friend to take over a guest seat. The friend's answer
// decides: until they accept nothing about the game changes; accepting hands them the seat through
// db/seatHandover.ts, so the game is in their history and stats, and counts its achievements once.
// Only the host invites, only friends, one pending invite per seat and per friend and game.
import type { Kysely } from 'kysely'
import { ulid } from 'ulid'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import type { GuestClaimInvite } from '../schema/lobby-ws.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import { areFriends } from '../db/friends.js'
import { handOverSeats } from '../db/seatHandover.js'
import * as q from '../db/guestClaims.js'

export type GuestClaims = components['schemas']['GuestClaims']
export type ClaimCode = components['schemas']['GuestClaimConflict']['code']

/** A refusal the API answers with: 404, 403 or a 409 carrying its code. */
export class ClaimError extends Error {
  constructor(
    readonly kind: 'not_found' | 'forbidden' | ClaimCode,
    message: string,
  ) {
    super(message)
  }
}

export interface GuestClaimDeps {
  db: Kysely<Database>
  /** Whether guest claims are on for the user (guestClaims.enabled). */
  available: (userId: string) => Promise<boolean>
  /** Tells the invited friend (a toast) and refreshes their /ws/me. */
  announce: (userId: string, invite: GuestClaimInvite) => Promise<void>
  /** Refreshes /ws/me for these users (their pending invites changed). */
  refresh: (userIds: string[]) => Promise<void>
  /** Counts achievements for a game that has a new player; a failure is logged, the claim stands. */
  countGame: (sessionId: string) => Promise<void>
  warn: (message: string, details?: Record<string, unknown>) => void
}

export class GuestClaimService {
  constructor(private readonly deps: GuestClaimDeps) {}

  private get db() {
    return this.deps.db
  }

  /** The host's view; anyone else, and a game that cannot be claimed, has nothing to show. */
  async view(hostId: string, gameId: string): Promise<GuestClaims> {
    const game = await q.claimGame(this.db, gameId)
    if (!game || game.hostId !== hostId || !claimable(game)) return { canClaim: false, seats: [] }
    const seats = await q.seatsWithInvites(this.db, gameId)
    return { canClaim: seats.length > 0, seats }
  }

  /** Asks `friendId` to take over the guest `seat`, replacing an invite still waiting for it. */
  async invite(hostId: string, gameId: string, seat: number, friendId: string): Promise<GuestClaims> {
    if (friendId === hostId) throw new ClaimError('not_friend', 'You can only ask a friend')
    const id = await this.db.transaction().execute(async tx => {
      const game = await q.claimGame(tx, gameId, true)
      if (!game || game.hostId !== hostId) throw new ClaimError('not_found', 'not found')
      if (!claimable(game)) throw new ClaimError('not_claimable', 'This game can no longer be claimed')
      if (!(await q.guestSeats(tx, gameId)).some(s => s.seat === seat)) throw new ClaimError('not_guest', 'That seat is not a guest')
      if (!(await areFriends(tx, hostId, friendId))) throw new ClaimError('not_friend', 'You can only ask a friend')
      if (!(await this.deps.available(friendId))) throw new ClaimError('unavailable', "They can't be asked to claim games yet")
      if (await q.isSeated(tx, gameId, friendId)) throw new ClaimError('already_seated', 'They played in this game already')
      const waiting = await q.pendingClaimOfSeat(tx, gameId, seat)
      if (waiting) await q.answerClaim(tx, waiting.id, 'cancelled')
      const other = await q.pendingClaimOfFriend(tx, gameId, friendId)
      if (other) throw new ClaimError('already_invited', 'They are asked for another seat of this game')
      const claimId = ulid()
      try {
        await q.insertClaim(tx, { id: claimId, gameId, seat, invitedUserId: friendId, invitedBy: hostId })
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) throw new ClaimError('already_invited', 'They are asked for another seat of this game')
        throw err
      }
      return { claimId, replaced: waiting?.invitedUserId ?? null }
    })
    const invite = (await q.pendingClaimsFor(this.db, friendId)).find(i => i.id === id.claimId)
    await Promise.allSettled([
      invite ? this.deps.announce(friendId, invite) : undefined,
      this.deps.refresh(id.replaced ? [id.replaced] : []),
    ])
    return this.view(hostId, gameId)
  }

  /** The host takes the invite for a guest seat back. */
  async cancel(hostId: string, gameId: string, seat: number): Promise<void> {
    const claim = await q.pendingClaimOfSeat(this.db, gameId, seat)
    if (!claim) throw new ClaimError('not_found', 'not found')
    if (claim.invitedBy !== hostId) throw new ClaimError('forbidden', 'Only the host can do that')
    if (await q.answerClaim(this.db, claim.id, 'cancelled')) await this.deps.refresh([claim.invitedUserId])
  }

  async decline(userId: string, claimId: string): Promise<void> {
    const claim = await q.getClaim(this.db, claimId)
    if (!claim || claim.invitedUserId !== userId || claim.status !== 'pending') throw new ClaimError('not_found', 'not found')
    await q.answerClaim(this.db, claimId, 'declined')
    await this.deps.refresh([userId])
  }

  /** The friend takes the seat: it becomes their account's, so the game is theirs from now on. */
  async accept(userId: string, claimId: string): Promise<void> {
    const { gameId, hostId } = await this.db.transaction().execute(async tx => {
      const found = await q.getClaim(tx, claimId)
      if (!found || found.invitedUserId !== userId) throw new ClaimError('not_found', 'not found')
      const game = await q.claimGame(tx, found.gameId, true)
      const claim = await q.getClaim(tx, claimId)
      if (!game || !claim || claim.status !== 'pending') throw new ClaimError('not_found', 'not found')
      if (!claimable(game)) throw new ClaimError('not_claimable', 'This game can no longer be claimed')
      if (!(await q.guestSeats(tx, game.id)).some(s => s.seat === claim.seat))
        throw new ClaimError('not_guest', 'That seat is taken already')
      if (await q.isSeated(tx, game.id, userId)) throw new ClaimError('already_seated', 'You played in this game already')
      await handOverSeats(tx, { sessionId: game.id, seat: claim.seat }, userId)
      await q.answerClaim(tx, claimId, 'accepted')
      return { gameId: game.id, hostId: claim.invitedBy }
    })
    // The seat moved in the transaction; counting is best effort and repeats on the startup backfill
    await this.deps.countGame(gameId).catch((err: unknown) => {
      this.deps.warn('achievements for a claimed game failed', { gameId, error: String(err) })
    })
    await this.deps.refresh([userId, hostId])
  }
}

/** A finished game that still counts; its tournament seats never show as guests (they have a claim link). */
const claimable = (game: q.ClaimGame) => game.finished && !game.invalidated
