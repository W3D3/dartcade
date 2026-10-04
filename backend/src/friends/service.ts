import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/friends.js'
import { pgErrorCode } from '../db/errors.js'
import type { components } from '../schema/api.js'
import { normalizeName } from '../users/names.js'
import { FriendError } from './errors.js'

type FriendList = components['schemas']['FriendList']
export type RequestOutcome = { id: string; status: 'pending' | 'accepted' }

const UNIQUE_VIOLATION = '23505'
const REQUEST_ATTEMPTS = 3

export type FriendsDeps = {
  db: Kysely<Database>
  /** Both sides of every change to a request or friendship. */
  onChange?: (userIds: string[]) => void
}

const newestFirst = <T extends { createdAt: Date }>(a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime()

/** Friend requests and friendships: the rules (spec "Friend requests"). */
export class FriendsService {
  constructor(private readonly deps: FriendsDeps) {}

  private get db(): Kysely<Database> { return this.deps.db }

  private changed(userIds: string[]): void { this.deps.onChange?.(userIds) }

  async list(userId: string): Promise<FriendList> {
    const rows = await q.friendshipsOf(this.db, userId)
    const incoming = rows.filter(r => r.status === 'pending' && r.addresseeId === userId).sort(newestFirst)
    const outgoing = rows.filter(r => r.status === 'pending' && r.requesterId === userId).sort(newestFirst)
    const mutual = await q.mutualFriendCounts(this.db, userId, incoming.map(r => r.otherId))
    return {
      friends: rows.filter(r => r.status === 'accepted').map(r => ({
        id: r.otherId, name: r.otherName, friendsSince: (r.respondedAt ?? r.createdAt).toISOString(),
      })),
      incoming: incoming.map(r => ({
        id: r.id, from: { id: r.otherId, name: r.otherName }, mutualFriends: mutual.get(r.otherId) ?? 0, createdAt: r.createdAt.toISOString(),
      })),
      outgoing: outgoing.map(r => ({ id: r.id, to: { id: r.otherId, name: r.otherName }, createdAt: r.createdAt.toISOString() })),
    }
  }

  /** Asks someone by exact name. A request to someone who already asked you accepts theirs. */
  async request(userId: string, rawName: string): Promise<RequestOutcome> {
    const name = normalizeName(rawName).replace(/^@/, '')
    const target = await q.findUserByName(this.db, name)
    if (!target) throw FriendError.notFound(`No player called ${name}`)
    if (target.id === userId) throw FriendError.badRequest("You can't add yourself")
    // A crossing request can win the race to the pair's row: then answer from that row
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
      const existing = await q.friendshipBetween(this.db, userId, target.id)
      if (existing) {
        if (existing.status === 'accepted') throw FriendError.conflict("You're already friends", 'already_friends')
        if (existing.requester_id === userId) throw FriendError.conflict('Request already sent', 'already_requested')
        if (await q.acceptFriendRequest(this.db, existing.id, new Date())) {
          this.changed([userId, target.id])
          return { id: existing.id, status: 'accepted' }
        }
        continue   // cancelled or declined meanwhile: look again
      }
      const id = ulid()
      try {
        await q.insertFriendRequest(this.db, { id, requesterId: userId, addresseeId: target.id })
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) continue
        throw err
      }
      this.changed([userId, target.id])
      return { id, status: 'pending' }
    }
    throw new Error(`friend request between ${userId} and ${target.id} kept clashing`)
  }

  // A pending request where the user is on `side`, or 404
  private async pending(userId: string, requestId: string, side: 'addressee' | 'requester') {
    const row = await q.getFriendship(this.db, requestId)
    const mine = row && (side === 'addressee' ? row.addressee_id : row.requester_id) === userId
    if (!row || !mine || row.status !== 'pending') throw FriendError.notFound('request not found')
    return row
  }

  async accept(userId: string, requestId: string): Promise<void> {
    const row = await this.pending(userId, requestId, 'addressee')
    if (!(await q.acceptFriendRequest(this.db, row.id, new Date()))) throw FriendError.notFound('request not found')
    this.changed([row.requester_id, row.addressee_id])
  }

  /** Deletes it quietly: the sender sees it leave "Sent" and may ask again. */
  async decline(userId: string, requestId: string): Promise<void> {
    const row = await this.pending(userId, requestId, 'addressee')
    if (!(await q.deletePendingRequest(this.db, row.id))) throw FriendError.notFound('request not found')
    this.changed([row.requester_id, row.addressee_id])
  }

  async cancel(userId: string, requestId: string): Promise<void> {
    const row = await this.pending(userId, requestId, 'requester')
    if (!(await q.deletePendingRequest(this.db, row.id))) throw FriendError.notFound('request not found')
    this.changed([row.requester_id, row.addressee_id])
  }

  async remove(userId: string, friendUserId: string): Promise<void> {
    if (!(await q.deleteFriendshipBetween(this.db, userId, friendUserId))) throw FriendError.notFound('not friends')
    this.changed([userId, friendUserId])
  }
}
