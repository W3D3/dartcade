// Where a dragged (or arrow-key moved) person lands, as the PATCH the server takes:
// `position` is their index in the lobby's people order with them taken out (the server's
// rules.reorder), `team` their team in the Teams panel. Pure, so the screens and the
// optimistic order agree with the server.
import type { LobbyPerson, TeamId } from '../api/lobby-ws'

export type Placement = { position: number; team?: TeamId }
export type Direction = 'up' | 'down' | 'left' | 'right'

/** The server's reorder (backend src/lobby/rules.ts): out of the order, back in at the index. */
export function reorder(ids: string[], id: string, index: number): string[] {
  const rest = ids.filter(x => x !== id)
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id)
  return rest
}

const indexOf = (people: LobbyPerson[], id: string): number => people.findIndex(p => p.id === id)
const without = (people: LobbyPerson[], id: string): string[] => people.map(p => p.id).filter(x => x !== id)

/** The people list: dropped before `beforeId` (null: at the bottom). */
export function listPlacement(people: LobbyPerson[], id: string, beforeId: string | null): Placement {
  const rest = without(people, id)
  const at = beforeId === null ? -1 : rest.indexOf(beforeId)
  return { position: at === -1 ? rest.length : at }
}

/** Who plays on a team, in lobby order (people sitting out aren't in the Teams panel). */
const roster = (people: LobbyPerson[], team: TeamId): LobbyPerson[] => people.filter(p => p.plays && p.team === team)

/**
 * The Teams panel: dropped on `team` before the teammate `beforeId` (null: after the last
 * teammate). A drop that leaves their team and its order as they were keeps their place in
 * the lobby, so dragging within a team never shuffles them past the other team's players.
 */
export function teamPlacement(people: LobbyPerson[], id: string, team: TeamId, beforeId: string | null): Placement {
  const current = indexOf(people, id)
  const rest = without(people, id)
  const mates = roster(people, team).filter(p => p.id !== id)
  let position: number
  if (beforeId !== null && rest.includes(beforeId)) position = rest.indexOf(beforeId)
  else {
    const last = mates.at(-1)
    position = last ? rest.indexOf(last.id) + 1 : current
  }
  if (people.find(p => p.id === id)?.team === team) {
    const before = roster(people, team).map(p => p.id)
    const after = roster(placed(people, id, { position, team }), team).map(p => p.id)
    if (before.join() === after.join()) position = current
  }
  return { position, team }
}

/** The people in their new order, with the new team: what the screen shows until the server answers. */
export function placed(people: LobbyPerson[], id: string, placement: Placement): LobbyPerson[] {
  const byId = new Map(people.map(p => [p.id, p]))
  return reorder(people.map(p => p.id), id, placement.position).flatMap(x => {
    const p = byId.get(x)
    if (!p) return []
    return x === id && placement.team !== undefined ? [{ ...p, team: placement.team }] : [p]
  })
}

/** Nothing would change: no need to ask the server. */
export function samePlace(people: LobbyPerson[], id: string, placement: Placement): boolean {
  const team = people.find(p => p.id === id)?.team
  return placement.position === indexOf(people, id) && (placement.team === undefined || placement.team === team)
}

/** The people list's arrow keys: one place up or down. */
export function listKeyMove(people: LobbyPerson[], id: string, dir: Direction): Placement | null {
  const i = indexOf(people, id)
  if (i === -1) return null
  if (dir === 'up') return i > 0 ? { position: i - 1 } : null
  if (dir === 'down') return i < people.length - 1 ? { position: i + 1 } : null
  return null
}

/**
 * The Teams panel's arrow keys: up and down past one teammate, left to Team A and right to
 * Team B at the same rank (or last, if that team is shorter).
 */
export function teamKeyMove(people: LobbyPerson[], id: string, dir: Direction): Placement | null {
  const team = people.find(p => p.id === id)?.team
  if (!team) return null
  const mates = roster(people, team)
  const k = mates.findIndex(p => p.id === id)
  if (dir === 'up') return k > 0 ? teamPlacement(people, id, team, mates[k - 1].id) : null
  if (dir === 'down') return k < mates.length - 1 ? teamPlacement(people, id, team, mates.at(k + 2)?.id ?? null) : null
  const target: TeamId = dir === 'left' ? 'A' : 'B'
  if (target === team) return null
  return teamPlacement(people, id, target, roster(people, target).at(k)?.id ?? null)
}
