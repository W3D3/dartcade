// What the Friends screens show for the server's friends list (the friends message on /ws/me).
// The server decides statuses, joinable, in-your-lobby and invited; this only words them.
import type { FriendSearchHit } from '../api'
import type { Friend, FriendStatus, IncomingFriendRequest, OutgoingFriendRequest } from '../api/lobby-ws'
import type { FriendList } from '../lobby/sockets'
import { gameName, inviteTime } from '../lobby/format.js'
import { describeConflict, type Refusal } from '../lobby/input.js'
import { normalizeName } from '$shared/names'

export type DotKind = FriendStatus['kind']
export type FriendsTab = 'all' | 'online' | 'requests'
export type RowAction = 'in-lobby' | 'join' | 'invite' | 'invited' | null

export const FRIENDS_TABS: readonly FriendsTab[] = ['all', 'online', 'requests']

export const isOnline = (f: Friend): boolean => f.status.kind !== 'offline'

export type LastSeen = NonNullable<Friend['lastSeen']>

const LAST_SEEN_TEXT: Record<LastSeen, string> = {
  now: 'Last online just now',
  today: 'Last online today',
  yesterday: 'Last online yesterday',
  week: 'Last online this week',
  older: 'Last online a while ago',
}

/** "Last online today": coarse on purpose, the server never sends an exact time. */
export const lastSeenText = (lastSeen: LastSeen | undefined): string => (lastSeen ? LAST_SEEN_TEXT[lastSeen] : 'Offline')

/** The line under a friend's name: "In Friday darts", "Playing X01", "Online", "Offline". */
export function statusLine(f: Friend): { text: string; tone: 'ink' | 'playing' | 'muted' } {
  const s = f.status
  switch (s.kind) {
    case 'playing':
      return { text: `Playing ${gameName(s.gameId)}`, tone: 'playing' }
    case 'lobby':
      return { text: f.inYourLobby ? `In your lobby · ${s.lobbyName}` : `In ${s.lobbyName}`, tone: 'ink' }
    case 'online':
      return { text: 'Online', tone: 'ink' }
    case 'offline':
      return { text: lastSeenText(f.lastSeen), tone: 'muted' }
  }
}

/** The right-hand action: the "In your lobby" pill, Join, Invite to lobby, or Invited. */
export function rowAction(f: Friend, inALobby: boolean): RowAction {
  if (f.inYourLobby) return 'in-lobby'
  if (f.status.kind === 'lobby' && f.status.joinable) return 'join'
  if (!inALobby) return null
  return f.invited ? 'invited' : 'invite'
}

/** The friends whose name contains `query` (a leading @ ignored, as the server does), any case; an empty query keeps everyone. */
export function filterFriends(friends: Friend[], query: string): Friend[] {
  const q = parseFriendName(query).toLowerCase()
  return q === '' ? friends : friends.filter(f => f.name.toLowerCase().includes(q))
}

/** Where Watch goes for a friend who is playing (and the flag is on); null for any other status. */
export function watchPath(status: FriendStatus, flagOn: boolean): string | null {
  return flagOn && status.kind === 'playing' ? `/watch/${status.sessionId}` : null
}

export function splitOnline(friends: Friend[]): { online: Friend[]; offline: Friend[] } {
  return { online: friends.filter(isOnline), offline: friends.filter(f => !isOnline(f)) }
}

export function tabCounts(list: FriendList): { all: number; online: number; requests: number } {
  return { all: list.friends.length, online: list.friends.filter(isOnline).length, requests: list.incoming.length }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "3 friends in common · 10 min ago". */
export function incomingMeta(r: IncomingFriendRequest, now: Date): string {
  const when = inviteTime(r.createdAt, now)
  if (r.mutualFriends === 0) return when
  return `${r.mutualFriends} ${r.mutualFriends === 1 ? 'friend' : 'friends'} in common · ${when}`
}

/** "Sent yesterday, 18:40". */
export function outgoingMeta(r: OutgoingFriendRequest, now: Date): string {
  return `Sent ${lowerFirst(inviteTime(r.createdAt, now))}`
}

/** What's typed into "Add a friend": a name, with or without @. */
export const parseFriendName = (raw: string): string => normalizeName(raw).replace(/^@/, '')

/** The result line under "Add a friend" (the ✓ is an icon in the card). */
export function sendOutcome(
  status: number,
  body: { error?: string; code?: string } | undefined,
  name: string,
): { ok: boolean; text: string } {
  if (status === 201) return { ok: true, text: `Request sent to @${name}` }
  if (status === 200) return { ok: true, text: "They asked you first — you're friends now" }
  if (body?.code === 'already_friends') return { ok: false, text: "You're already friends" }
  if (body?.code === 'already_requested') return { ok: false, text: 'Request already sent' }
  return { ok: false, text: body?.error ?? "Couldn't send the request" }
}

/** Why Join didn't work (the row was older than the lobby's state). */
export function joinRefusal(status: number, body: Refusal): string {
  if (status === 403) return "You can't join that lobby without its code any more"
  if (status === 404) return 'That lobby has closed'
  return describeConflict(body)
}

/** The shortest search text the server answers; it finds nothing below this. */
export const SEARCH_MIN = 3

/** "3 friends in common", or nothing to say. */
export const mutualMeta = (n: number): string => (n === 0 ? '' : `${n} ${n === 1 ? 'friend' : 'friends'} in common`)

/** What a search result offers: the state it is in, and the button (none for friends and sent requests). */
export function searchState(request: FriendSearchHit['request']): { text: string; action: 'Add' | 'Accept' | null } {
  switch (request) {
    case 'friends':
      return { text: 'Friends', action: null }
    case 'sent':
      return { text: 'Request sent', action: null }
    case 'received':
      return { text: 'Wants to be your friend', action: 'Accept' }
    case 'none':
      return { text: '', action: 'Add' }
  }
}
