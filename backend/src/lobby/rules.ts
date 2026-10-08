import { games } from '../games/index.js'
import type { GameConfig } from '../session/types.js'
import type { LobbyPerson, LobbyState, NextGame, TeamId, ThrowOrder } from './types.js'
import { shuffle } from '../session/rng.js'

/** A board someone picks for a person: its id and owner. */
export type BoardTarget = { boardId: string; ownerUserId: string }

/** Who acts for a person: a member for themselves, a guest's adder for the guest. */
export const controllerOf = (p: LobbyPerson): string => p.userId ?? p.addedByUserId

export const memberOf = (lobby: LobbyState, userId: string): LobbyPerson | undefined => lobby.people.find(p => p.userId === userId)

export const isMember = (lobby: LobbyState, userId: string): boolean => memberOf(lobby, userId) !== undefined

/**
 * A guest shares the ready state of whoever added them (their own stored flag doesn't
 * matter); a member's ready is their own. Used by the snapshot and by `startPlan` so both
 * agree on who's ready.
 */
export function effectiveReady(lobby: LobbyState, person: LobbyPerson): boolean {
  if (person.bot !== null) return true
  if (person.userId !== null) return person.ready
  return memberOf(lobby, person.addedByUserId)?.ready ?? person.ready
}

/** Only one account is in the lobby; guests and pending invites don't count. */
export const isSolo = (lobby: LobbyState): boolean => lobby.people.filter(p => p.userId !== null).length <= 1

/** The host has host rights only while they're in the lobby. */
export const isHost = (lobby: LobbyState, userId: string): boolean => lobby.hostUserId === userId && isMember(lobby, userId)

/** Joining without the code: only a friend of the host, while the lobby is open to friends. */
export const friendsMayJoin = (lobby: Pick<LobbyState, 'access' | 'hostUserId'>, hostIsFriend: boolean): boolean =>
  lobby.access === 'friends' && lobby.hostUserId !== null && hostIsFriend

/**
 * The board rule (spec, Decisions → Boards). Menus only list your own boards. Anyone
 * gives a person on Manual one of their own boards. Once they have one, only the person
 * (a guest's adder) changes it, and the board's owner can take it back (to Manual).
 * `target` null means Manual.
 */
export function canSetBoard(actorUserId: string, person: LobbyPerson, target: BoardTarget | null): boolean {
  // A bot never has a board (the scheduler drives it, with no board to throw on): not even a
  // later "move board" action may give it one, same as addGuest refuses one when it's added.
  if (person.bot !== null) return false
  const controls = controllerOf(person) === actorUserId
  if (target === null) return controls || (person.boardId !== null && person.boardOwnerUserId === actorUserId)
  if (target.ownerUserId !== actorUserId) return false
  return controls || person.boardId === null
}

/**
 * Nobody sets someone else's ready, not even the host. A guest has no ready of their own
 * to set: a guest's ready follows their adder, so the adder sets it on their own row.
 */
export const canSetReady = (actorUserId: string, person: LobbyPerson): boolean =>
  person.userId !== null && controllerOf(person) === actorUserId

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

/**
 * Who takes over as host if the current host leaves now: the other member who has been
 * in the lobby longest (ties: lobby order). null when nobody would (the host is alone, or
 * already gone).
 */
export function nextHost(lobby: LobbyState): { userId: string; name: string } | null {
  let best: { userId: string; name: string; at: number; position: number } | null = null
  for (const p of lobby.people) {
    if (p.userId === null || p.userId === lobby.hostUserId) continue
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

const bullOffModeOf = (g: NextGame | null): 'off' | 'wdc' | 'pdc' => {
  const v = g?.config.bullOff
  return v === 'wdc' || v === 'pdc' ? v : 'off'
}

export type BullOffCoupling =
  | { throwOrder: ThrowOrder; nextGame: NextGame | null; throwOrderChanged: boolean; nextGameChanged: boolean }
  | { error: string }

/**
 * Keeps the lobby's throw order and the next game's bull off setting in sync (the user's
 * rule: the server decides, the screens read). A `nextGame` patch with bull off on turns
 * the throw order to `bulloff`; off (or missing) turns a `bulloff` order back to `lobby`. A
 * `throwOrder` patch to `bulloff` turns the game's bull off on (`wdc` if it wasn't already
 * on); to `lobby`/`random` turns it off. A game without a bull off of its own can't use
 * `bulloff`, same as a start refuses it.
 */
export function coupleBullOff(
  lobby: { throwOrder: ThrowOrder; nextGame: NextGame | null },
  patch: { throwOrder?: ThrowOrder; nextGame?: NextGame | null },
  hasBullOff: (gameId: string) => boolean,
): BullOffCoupling {
  let throwOrder = patch.throwOrder ?? lobby.throwOrder
  let throwOrderChanged = patch.throwOrder !== undefined
  let nextGame = patch.nextGame !== undefined ? patch.nextGame : lobby.nextGame
  let nextGameChanged = patch.nextGame !== undefined

  if (patch.nextGame !== undefined && patch.throwOrder === undefined) {
    if (bullOffModeOf(nextGame) !== 'off') {
      if (throwOrder !== 'bulloff') {
        throwOrder = 'bulloff'
        throwOrderChanged = true
      }
    } else if (throwOrder === 'bulloff') {
      throwOrder = 'lobby'
      throwOrderChanged = true
    }
  }

  if (patch.throwOrder !== undefined) {
    if (throwOrder === 'bulloff') {
      if (nextGame && bullOffModeOf(nextGame) === 'off') {
        nextGame = { ...nextGame, config: { ...nextGame.config, bullOff: 'wdc' } }
        nextGameChanged = true
      }
    } else if (nextGame && bullOffModeOf(nextGame) !== 'off') {
      nextGame = { ...nextGame, config: { ...nextGame.config, bullOff: 'off' } }
      nextGameChanged = true
    }
  }

  if (throwOrder === 'bulloff' && nextGame && !hasBullOff(nextGame.gameId)) {
    return { error: `${nextGame.gameId} has no bull off: pick another throw order` }
  }

  return { throwOrder, nextGame, throwOrderChanged, nextGameChanged }
}

// ---- teams ------------------------------------------------------------------------

/** A game played in teams: its game does teams and its format is `teams`. */
export const isTeamFormat = (gameId: string, config: GameConfig): boolean => games[gameId]?.teams === true && config.format === 'teams'

/** The lobby's next game is played in teams. */
export const isTeamGame = (lobby: { nextGame: NextGame | null }): boolean =>
  lobby.nextGame !== null && isTeamFormat(lobby.nextGame.gameId, lobby.nextGame.config)

/** The host moves people between teams and shuffles them; members only see the teams. */
export const canSetTeam = (lobby: LobbyState, actorUserId: string): boolean => isHost(lobby, actorUserId)

type TeamPerson = Pick<LobbyPerson, 'id' | 'plays' | 'team'>

/**
 * The teams to write for people who play and have none (person id → team). With nobody
 * who plays on a team yet, they alternate A, B in lobby order (a 50/50 split, and the lobby
 * order stays the throw order); otherwise each goes to the smaller team, A on a tie,
 * counting only people who play. Sitting out keeps a team but doesn't count.
 */
export function assignTeams(lobby: { people: readonly TeamPerson[] }): Map<string, TeamId> {
  const playing = lobby.people.filter(p => p.plays)
  const out = new Map<string, TeamId>()
  const count = { A: 0, B: 0 }
  for (const p of playing) if (p.team !== null) count[p.team]++
  const fresh = count.A + count.B === 0
  playing.forEach((p, i) => {
    if (p.team !== null) return
    const team: TeamId = fresh ? (i % 2 === 0 ? 'A' : 'B') : count.B < count.A ? 'B' : 'A'
    count[team]++
    out.set(p.id, team)
  })
  return out
}

/**
 * A random 50/50 split of the people who play (person id → team): shuffled, then A, B
 * alternating. Sitting out keeps their team. `random` in [0, 1), as Math.random.
 */
export function shuffleTeams(lobby: { people: readonly TeamPerson[] }, random: () => number = Math.random): Map<string, TeamId> {
  const ids = shuffle(
    lobby.people.filter(p => p.plays).map(p => p.id),
    random,
  )
  return new Map(ids.map((id, i) => [id, i % 2 === 0 ? 'A' : 'B']))
}

/** `base`, or `base (2)`, `base (3)`...: the first name no one in `taken` has (case-insensitive). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(n => n.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}
