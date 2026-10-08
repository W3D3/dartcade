// The lobby's Friends tab (Lobby board): every friend with what you can do about this lobby.
// Friends to invite lead (online first), then invites waiting, then who's already in, then offline.
import type { Friend } from '../api/lobby-ws'
import { statusLine } from '../friends/view.js'

export type LobbyFriendState = 'invite' | 'invited' | 'in-lobby'
export type LobbyFriendRow = {
  friend: Friend
  state: LobbyFriendState
  line: string
  tone: 'ink' | 'playing' | 'muted'
}

const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

function row(f: Friend): LobbyFriendRow & { rank: number } {
  const offline = f.status.kind === 'offline'
  if (f.inYourLobby) return { friend: f, state: 'in-lobby', line: statusLine(f).text, tone: 'ink', rank: 2 }
  if (f.invited) return { friend: f, state: 'invited', line: `Invite sent · waiting for ${f.name}`, tone: 'ink', rank: 1 }
  if (offline) return { friend: f, state: 'invite', line: 'Offline · sees the invite next time', tone: 'muted', rank: 3 }
  const s = statusLine(f)
  return { friend: f, state: 'invite', line: s.text, tone: s.tone, rank: 0 }
}

export function lobbyFriendRows(friends: Friend[]): LobbyFriendRow[] {
  return friends
    .map(row)
    .sort((a, b) => a.rank - b.rank || byName(a.friend, b.friend))
    .map(({ rank: _rank, ...r }) => r)
}
