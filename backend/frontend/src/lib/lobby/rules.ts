// Which lobby controls the viewer gets. The server decides (backend src/lobby/rules.ts);
// this mirrors it so the screens only offer what it would accept.
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
import type { components } from '../api/schema'

/** A change to one person (PATCH /api/lobbies/:id/people/:pid): board, who plays, ready, place. */
export type PersonPatch = components['schemas']['UpdatePersonRequest']

/** A change to the lobby (PATCH /api/lobbies/:id, the host): name, throw order, next game, a new code. */
export type LobbyPatch = components['schemas']['UpdateLobbyRequest']

/** One of the viewer's own paired boards. */
export type OwnBoard = { id: string; name: string }

/** Who acts for a person: a member for themselves, a guest's adder for the guest. */
export const controllerOf = (p: LobbyPerson): string => p.userId ?? p.addedByUserId

/** The host has host rights only while they're in the lobby. */
export const isHost = (lobby: Lobby, viewerId: string | null): boolean =>
  viewerId !== null && lobby.hostUserId === viewerId && lobby.people.some(p => p.userId === viewerId)

/** The host's name, or null while the lobby has no host in it. */
export const hostName = (lobby: Lobby): string | null =>
  lobby.people.find(p => p.userId !== null && p.userId === lobby.hostUserId)?.name ?? null

export const myRow = (lobby: Lobby, viewerId: string | null): LobbyPerson | null =>
  lobby.people.find(p => p.userId !== null && p.userId === viewerId) ?? null

/** You, or a guest you added. */
export const isMine = (p: LobbyPerson, viewerId: string | null): boolean =>
  viewerId !== null && controllerOf(p) === viewerId

/**
 * Nobody sets someone else's ready, not even the host. A guest has no ready of their own
 * to set: a guest's ready follows their adder, so the adder sets it on their own row.
 */
export const canSetReady = (p: LobbyPerson, viewerId: string | null): boolean => p.userId !== null && isMine(p, viewerId)

/** "In" / "sits out": your own rows, or anyone's for the host. */
export const canSetPlays = (lobby: Lobby, p: LobbyPerson, viewerId: string | null): boolean =>
  isMine(p, viewerId) || isHost(lobby, viewerId)

export const canMove = (lobby: Lobby, viewerId: string | null): boolean => isHost(lobby, viewerId)

/** The host removes anyone else; a member removes their own guests. Leaving is separate. */
export function canRemove(lobby: Lobby, p: LobbyPerson, viewerId: string | null): boolean {
  if (viewerId === null || p.userId === viewerId) return false
  if (isHost(lobby, viewerId)) return true
  return p.userId === null && p.addedByUserId === viewerId
}

/** An entry in a person's board menu; boardId null is manual entry. */
export type BoardChoice = { boardId: string | null; label: string; detail: string; current: boolean }

/**
 * What the board chip offers the viewer for this person (spec, Decisions → Boards). Your own
 * boards for someone on manual entry; once they have a board only they (a guest's adder)
 * change it, and the board's owner can take it back. Empty: no menu.
 */
export function boardChoices(p: LobbyPerson, viewerId: string | null, own: OwnBoard[]): BoardChoice[] {
  if (viewerId === null) return []
  const controls = isMine(p, viewerId)
  const owner = p.boardId !== null && p.boardOwnerUserId === viewerId
  const choices: BoardChoice[] = []
  if (controls || owner) {
    choices.push({
      boardId: null, label: 'Manual entry',
      detail: controls ? 'Enter darts on the keypad' : `Take ${p.boardName ?? 'your board'} back`,
      current: p.boardId === null,
    })
  }
  if (controls || p.boardId === null) {
    for (const b of own) choices.push({ boardId: b.id, label: b.name, detail: 'Your board', current: p.boardId === b.id })
  }
  return choices
}

export function counts(lobby: Lobby): { people: number; playing: number; ready: number } {
  const playing = lobby.people.filter(p => p.plays)
  return { people: lobby.people.length, playing: playing.length, ready: playing.filter(p => p.ready).length }
}

/** The boards the next game's players use, in lobby order: "Living room, Lena's place". */
export function boardSummary(lobby: Lobby): string {
  const names: string[] = []
  for (const p of lobby.people) {
    const name = p.boardName ?? 'Manual entry'
    if (p.plays && !names.includes(name)) names.push(name)
  }
  return names.join(', ')
}

/** You play the next game, yourself or through a guest of yours. */
export const playsInGame = (lobby: Lobby, viewerId: string | null): boolean =>
  lobby.people.some(p => p.plays && isMine(p, viewerId))

/** The games with a bull off of their own (a `bullOff` setting): the lobby's Bull-off throw order drives it. */
const BULL_OFF_GAMES = new Set(['x01'])

/** The game has a bull off, so the Bull-off throw order can apply to it. Whether enough people play is the server's call. */
export const hasBullOff = (gameId: string | null): boolean => gameId !== null && BULL_OFF_GAMES.has(gameId)

/** Accounts the add field doesn't suggest: already in the lobby, or invited. */
export const alreadyInOrInvited = (lobby: Lobby): string[] =>
  [...lobby.people.flatMap(p => (p.userId ? [p.userId] : [])), ...lobby.invites.map(i => i.userId)]
