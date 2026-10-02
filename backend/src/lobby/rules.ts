import type { LobbyPerson, LobbyState } from './types.js'

/** A board someone picks for a person: its id and owner. */
export type BoardTarget = { boardId: string; ownerUserId: string }

/** Who acts for a person: a member for themselves, a guest's adder for the guest. */
export const controllerOf = (p: LobbyPerson): string => p.userId ?? p.addedByUserId

export const memberOf = (lobby: LobbyState, userId: string): LobbyPerson | undefined =>
  lobby.people.find(p => p.userId === userId)

export const isMember = (lobby: LobbyState, userId: string): boolean => memberOf(lobby, userId) !== undefined

/** The host has host rights only while they're in the lobby. */
export const isHost = (lobby: LobbyState, userId: string): boolean =>
  lobby.hostUserId === userId && isMember(lobby, userId)

/**
 * The board rule (spec, Decisions → Boards). Menus only list your own boards. Anyone
 * gives a person on Manual one of their own boards. Once they have one, only the person
 * (a guest's adder) changes it, and the board's owner can take it back (to Manual).
 * `target` null means Manual.
 */
export function canSetBoard(actorUserId: string, person: LobbyPerson, target: BoardTarget | null): boolean {
  const controls = controllerOf(person) === actorUserId
  if (target === null) return controls || (person.boardId !== null && person.boardOwnerUserId === actorUserId)
  if (target.ownerUserId !== actorUserId) return false
  return controls || person.boardId === null
}

/** Nobody sets someone else's ready, not even the host. */
export const canSetReady = (actorUserId: string, person: LobbyPerson): boolean => controllerOf(person) === actorUserId

/** "I'm in" / "sitting out": the person (a guest's adder), or the host for anyone. */
export const canSetPlays = (lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean =>
  controllerOf(person) === actorUserId || isHost(lobby, actorUserId)

export const canMove = (lobby: LobbyState, actorUserId: string): boolean => isHost(lobby, actorUserId)

/** The host removes anyone else; a member removes their own guests. Leaving is separate. */
export function canRemove(lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean {
  if (person.userId === actorUserId) return false
  if (isHost(lobby, actorUserId)) return true
  return person.userId === null && person.addedByUserId === actorUserId
}

/** Who takes over as host: the member who has been in the lobby longest (ties: lobby order). */
export function nextHost(lobby: LobbyState): { userId: string; name: string } | null {
  let best: { userId: string; name: string; at: number; position: number } | null = null
  for (const p of lobby.people) {
    if (p.userId === null) continue
    const at = p.joinedAt.getTime()
    if (best === null || at < best.at || (at === best.at && p.position < best.position)) {
      best = { userId: p.userId, name: p.name, at, position: p.position }
    }
  }
  return best === null ? null : { userId: best.userId, name: best.name }
}

/** The people a member's leaving takes along: themselves and their guests. */
export const leavingWith = (lobby: LobbyState, userId: string): LobbyPerson[] =>
  lobby.people.filter(p => p.userId === userId || (p.userId === null && p.addedByUserId === userId))

/** Person ids in lobby order after moving one person to `index` (clamped to the list). */
export function reorder(people: LobbyPerson[], personId: string, index: number): string[] {
  const ids = people.map(p => p.id).filter(id => id !== personId)
  ids.splice(Math.max(0, Math.min(index, ids.length)), 0, personId)
  return ids
}
