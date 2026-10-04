// The lobby's add field lists friends first: one-tap chips (online first), then name matches.
import type { Friend } from '../api/lobby-ws'

export type FriendChip = { id: string; name: string; online: boolean; aria: string }

const byName = (a: Friend, b: Friend) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
const online = (f: Friend) => f.status.kind !== 'offline'

/** Friends to add with one tap: not in the lobby or invited yet, online first, then by name. */
export function friendChips(friends: Friend[], exclude: readonly string[], max = 6): FriendChip[] {
  const free = friends.filter(f => !exclude.includes(f.id))
  return [...free.filter(online).sort(byName), ...free.filter(f => !online(f)).sort(byName)].slice(0, max).map(f => ({
    id: f.id, name: f.name, online: online(f), aria: `Add your friend ${f.name}${online(f) ? ', online now' : ''}`,
  }))
}

/** Friends whose name starts with what's typed after the @ (any case), for the suggestions. */
export function friendMatches(friends: Friend[], query: string, exclude: readonly string[]): Friend[] {
  const q = query.trim().toLowerCase()
  if (q === '') return []
  return friends.filter(f => !exclude.includes(f.id) && f.name.toLowerCase().startsWith(q)).sort(byName)
}
