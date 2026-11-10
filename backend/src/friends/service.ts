import { warn } from '../log.js'
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/friends.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import type { components } from '../schema/api.js'
import { normalizeName } from '../shared/names.js'
import type { LobbyHub } from '../lobby/hub.js'
import { checkLobbyMessage } from '../lobby/validation.js'
import type { FriendsMessage } from '../schema/lobby-ws.js'
import { FriendError } from './errors.js'
import { KeyedDebounce, PUSH_DEBOUNCE_MS } from './debounce.js'
import { OFFLINE_GRACE_MS, Presence } from './presence.js'
import { friendStatus } from './status.js'
import { lastSeenBucket } from './lastSeen.js'
import { KeyedQueue } from '../util/keyedQueue.js'

type FriendList = components['schemas']['FriendList']
type LastSeen = components['schemas']['LastSeen']
type PlayerFriends = components['schemas']['PlayerFriends']
type FriendSearchResult = components['schemas']['FriendSearchResult']
export type RequestOutcome = { id: string; status: 'pending' | 'accepted' }

const REQUEST_ATTEMPTS = 3
const SEARCH_MIN = 3
const SEARCH_LIMIT = 10
const SUGGESTION_LIMIT = 5

export type FriendsDeps = {
  db: Kysely<Database>
  /** Open /ws/me sockets: where friends messages go. */
  hub: LobbyHub
  /** The running game the user is seated in, if any (status "playing"). */
  gameOf: (userId: string) => { gameId: string; sessionId: string } | null
  /** Both sides of every change to a request or friendship. */
  onChange?: (userIds: string[]) => void
  graceMs?: number
  debounceMs?: number
  warn?: (message: string, details: unknown) => void
}

const newestFirst = <T extends { createdAt: Date }>(a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime()

/** Friend requests and friendships: the rules (spec "Friend requests"). */
export class FriendsService {
  private readonly presence: Presence
  private readonly pushes: KeyedDebounce
  private readonly inflight = new Set<Promise<void>>()
  // Per user, the last push: the next one waits for it, so an older list never lands last
  private readonly pushChains = new KeyedQueue()
  private closed = false

  constructor(private readonly deps: FriendsDeps) {
    this.presence = new Presence(userId => {
      if (this.presence.isOnline(userId)) this.touch([userId])
      else void this.track(this.wentOffline(userId))
    }, deps.graceMs ?? OFFLINE_GRACE_MS)
    this.pushes = new KeyedDebounce(deps.debounceMs ?? PUSH_DEBOUNCE_MS, userId => {
      this.push(userId)
    })
  }

  private get db(): Kysely<Database> {
    return this.deps.db
  }

  private warn(message: string, details: unknown): void {
    ;(this.deps.warn ?? warn)(message, details)
  }

  private changed(userIds: string[]): void {
    this.refresh(userIds)
    this.deps.onChange?.(userIds)
  }

  // ---- presence and pushes ----------------------------------------------------------

  /**
   * A /ws/me socket opened or closed (see browser-gw/lobby.ts). An opened socket got a list
   * built just before: one more (debounced) push catches whatever changed since.
   */
  connected(userId: string): void {
    this.presence.connect(userId)
    this.refresh([userId])
  }
  disconnected(userId: string): void {
    this.presence.disconnect(userId)
  }
  /** Offline for friends at once, without the grace (a banned account). */
  dropPresence(userId: string): void {
    this.presence.drop(userId)
  }
  isOnline(userId: string): boolean {
    return this.presence.isOnline(userId)
  }

  // Remembers when they left before friends hear of it, so the push already says "last online"
  private async wentOffline(userId: string): Promise<void> {
    try {
      await q.touchLastSeen(this.db, userId, new Date())
    } finally {
      this.touch([userId])
    }
  }

  /** These users' status changed (presence, lobby, game, Invisible, name): they and their friends get fresh lists. */
  touch(userIds: string[]): void {
    if (this.closed) return
    void this.track(
      (async () => {
        const affected = new Set(userIds)
        for (const userId of userIds) for (const f of await q.friendIdsOf(this.db, userId)) affected.add(f)
        this.refresh([...affected])
      })(),
    )
  }

  /** Exactly these users' lists changed: pushed (debounced) to those with /ws/me open. */
  refresh(userIds: string[]): void {
    if (this.closed) return
    for (const userId of new Set(userIds)) if (this.deps.hub.hasMe(userId)) this.pushes.schedule(userId)
  }

  private push(userId: string): void {
    void this.track(
      this.pushChains.run(userId, async () => {
        const msg = await this.message(userId)
        if (!this.closed) this.deps.hub.sendFriends(userId, msg)
      }),
    )
  }

  private track(p: Promise<void>): Promise<void> {
    const tracked: Promise<void> = p
      .catch((err: unknown) => {
        this.warn('friends push failed', { error: String(err) })
      })
      .finally(() => {
        this.inflight.delete(tracked)
      })
    this.inflight.add(tracked)
    return tracked
  }

  /** Tests: runs every pending push now and waits for them. */
  async flush(): Promise<void> {
    while (this.inflight.size > 0 || this.pushes.pending() > 0) {
      await Promise.all([...this.inflight])
      this.pushes.flush()
    }
  }

  /**
   * The server stops: no more pushes, and no grace or debounce timers left running. Everyone who was
   * online (or leaving) is last seen now: their grace timer will never fire, so nobody else writes it.
   */
  async close(): Promise<void> {
    this.closed = true
    const online = this.presence.close()
    this.pushes.cancel()
    await Promise.allSettled([...this.inflight])
    await q.setLastSeen(this.db, online, new Date())
  }

  async message(userId: string): Promise<FriendsMessage> {
    const msg: FriendsMessage = { type: 'friends', ...(await this.list(userId)) }
    checkLobbyMessage(msg, m => {
      this.warn(m, {})
    })
    return msg
  }

  /** Whether the viewer is a friend of any of these accounts who is not Invisible (Watch). */
  async watchable(viewerId: string, userIds: string[]): Promise<boolean> {
    const rows = await q.friendshipsOf(this.db, viewerId)
    return rows.some(r => r.status === 'accepted' && !r.otherInvisible && userIds.includes(r.otherId))
  }

  // ---- lists ------------------------------------------------------------------------

  async list(userId: string): Promise<FriendList> {
    const rows = await q.friendshipsOf(this.db, userId)
    const accepted = rows.filter(r => r.status === 'accepted')
    const incoming = rows.filter(r => r.status === 'pending' && r.addresseeId === userId).sort(newestFirst)
    const outgoing = rows.filter(r => r.status === 'pending' && r.requesterId === userId).sort(newestFirst)
    const friendIds = new Set(accepted.map(r => r.otherId))
    const lobbies = await q.openLobbiesOf(this.db, [userId, ...friendIds])
    const myLobby = lobbies.get(userId) ?? null
    const invited = myLobby ? await q.pendingInviteesOf(this.db, myLobby.id) : new Set<string>()
    const now = new Date()
    const mutual = await q.mutualFriendCounts(
      this.db,
      userId,
      incoming.map(r => r.otherId),
    )
    return {
      friends: accepted.map(r => {
        const lobby = lobbies.get(r.otherId) ?? null
        return {
          id: r.otherId,
          name: r.otherName,
          friendsSince: (r.respondedAt ?? r.createdAt).toISOString(),
          status: friendStatus(
            { online: this.isOnline(r.otherId), invisible: r.otherInvisible, game: this.deps.gameOf(r.otherId), lobby },
            friendIds,
          ),
          inYourLobby: myLobby !== null && lobby?.id === myLobby.id,
          invited: invited.has(r.otherId),
          avatar: r.otherAvatar,
          ...this.lastSeen(r.otherId, r.otherInvisible, r.otherLastSeenAt, now),
        }
      }),
      incoming: incoming.map(r => ({
        id: r.id,
        from: { id: r.otherId, name: r.otherName, avatar: r.otherAvatar },
        mutualFriends: mutual.get(r.otherId) ?? 0,
        createdAt: r.createdAt.toISOString(),
      })),
      outgoing: outgoing.map(r => ({
        id: r.id,
        to: { id: r.otherId, name: r.otherName, avatar: r.otherAvatar },
        createdAt: r.createdAt.toISOString(),
      })),
    }
  }

  // Only for an offline friend who is not Invisible (their choice of Nobody arrives as null)
  private lastSeen(userId: string, invisible: boolean, at: Date | null, now: Date): { lastSeen?: LastSeen } {
    if (invisible || at === null || this.isOnline(userId)) return {}
    return { lastSeen: lastSeenBucket(at, now) }
  }

  /**
   * A profile's Friends section as the viewer may see it. Last online: friends only. The list: yourself,
   * or a friend while the owner shares it with friends. Everyone gets the mutual count (not on yourself).
   */
  async playerFriends(viewerId: string, targetId: string): Promise<PlayerFriends> {
    const privacy = await q.privacyOf(this.db, targetId)
    if (!privacy) throw FriendError.notFound('player not found')
    const self = viewerId === targetId
    const friend = !self && (await q.areFriends(this.db, viewerId, targetId))
    const mutualCount = self ? 0 : ((await q.mutualFriendCounts(this.db, viewerId, [targetId])).get(targetId) ?? 0)
    const lastSeenAt = friend && privacy.showLastOnline === 'friends' ? privacy.lastSeenAt : null
    const lastSeen = this.lastSeen(targetId, privacy.invisible, lastSeenAt, new Date())
    if (!self && !(friend && privacy.friendsVisibility === 'friends')) return { ...lastSeen, mutualCount, friends: null }
    const [theirs, mine] = await Promise.all([q.friendshipsOf(this.db, targetId), q.friendshipsOf(this.db, viewerId)])
    const relations = new Map(
      mine.map(r => [
        r.otherId,
        r.status === 'accepted' ? ('friend' as const) : r.requesterId === viewerId ? ('requested' as const) : ('incoming' as const),
      ]),
    )
    const friends = theirs
      .filter(r => r.status === 'accepted')
      .map(r => ({
        id: r.otherId,
        name: r.otherName,
        avatar: r.otherAvatar,
        mutual: !self && relations.get(r.otherId) === 'friend',
        relation: r.otherId === viewerId ? ('self' as const) : (relations.get(r.otherId) ?? ('none' as const)),
      }))
      // Mutual friends first; the rest keep the by-name order of the query
      .sort((a, b) => Number(b.mutual) - Number(a.mutual))
    return { ...lastSeen, mutualCount, friends }
  }

  /** Up to SEARCH_LIMIT accounts by part of a name or an exact email, with friends in common; a short term finds nothing. */
  async search(userId: string, rawTerm: string): Promise<FriendSearchResult[]> {
    const term = normalizeName(rawTerm).replace(/^@/, '')
    if (Array.from(term).length < SEARCH_MIN) return []
    return this.withMutual(userId, await q.searchUsersForFriends(this.db, term, userId, SEARCH_LIMIT))
  }

  /** People you may know: friends of your friends, the most in common first. */
  async suggestions(userId: string): Promise<FriendSearchResult[]> {
    return this.withMutual(userId, await q.suggestionsFor(this.db, userId, SUGGESTION_LIMIT))
  }

  private async withMutual(userId: string, hits: q.FriendSearchHit[]): Promise<FriendSearchResult[]> {
    const mutual = await q.mutualFriendCounts(
      this.db,
      userId,
      hits.map(h => h.id),
    )
    return hits.map(h => ({ ...h, mutualFriends: mutual.get(h.id) ?? 0 }))
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
        continue // cancelled or declined meanwhile: look again
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
