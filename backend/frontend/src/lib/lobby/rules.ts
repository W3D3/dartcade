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

/**
 * The game has a bull off of its own (a `bullOff` setting in the server's defaults, as the
 * server checks it), so the Bull-off throw order can apply to it. Whether enough people play
 * is the server's call.
 */
export const hasBullOff = (game: { defaultConfig: Record<string, unknown> } | undefined): boolean =>
  game !== undefined && 'bullOff' in game.defaultConfig

/** Accounts the add field doesn't suggest: already in the lobby, or invited. */
export const alreadyInOrInvited = (lobby: Lobby): string[] =>
  [...lobby.people.flatMap(p => (p.userId ? [p.userId] : [])), ...lobby.invites.map(i => i.userId)]

// ---- teams ------------------------------------------------------------------------

/** The next game is played in teams: its mode supports teams and its config picked that format. */
export const isTeamFormat = (teams: boolean | undefined, config: { format?: unknown }): boolean =>
  teams === true && config.format === 'teams'

/** The lobby's next game is played in teams: its saved settings over its mode's defaults pick them. */
export function nextGameInTeams(lobby: Lobby, modes: { id: string; teams: boolean; defaultConfig: Record<string, unknown> }[]): boolean {
  const game = lobby.nextGame
  const mode = game ? modes.find(m => m.id === game.gameId) : undefined
  return game !== null && mode !== undefined && isTeamFormat(mode.teams, { ...mode.defaultConfig, ...game.config })
}

/** The people who play, split into Team A and Team B, each in lobby order. Once it's a team
 * game the server gives everyone who plays a team, so this only reads the snapshot. */
export function teamRosters(lobby: Lobby): { a: LobbyPerson[]; b: LobbyPerson[] } {
  const playing = lobby.people.filter(p => p.plays)
  return { a: playing.filter(p => p.team === 'A'), b: playing.filter(p => p.team === 'B') }
}

/** What the teams panel says below the columns: an empty team, or an uneven split. null: nothing to say. */
export function teamsMessage(a: number, b: number): string | null {
  if (a === 0 || b === 0) return 'Both teams need a player.'
  if (a !== b) return "Teams are uneven. The smaller team's players throw more often."
  return null
}
