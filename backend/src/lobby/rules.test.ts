import { describe, it, expect } from 'vitest'
import type { LobbyPerson, LobbyState } from './types.js'
import {
  assignTeams,
  canMove,
  canRemove,
  canSetBoard,
  canSetPlays,
  canSetReady,
  canSetTeam,
  effectiveReady,
  friendsMayJoin,
  isHost,
  isSolo,
  isTeamGame,
  leavingWith,
  nextHost,
  reorder,
  shuffleTeams,
} from './rules.js'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p',
  userId: null,
  addedByUserId: 'chris',
  name: 'X',
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  position: 0,
  plays: true,
  ready: false,
  boardMovedBy: null,
  joinedAt: new Date(0),
  usualBoardName: null,
  team: null,
  bot: null,
  ...over,
})
const lobbyOf = (people: LobbyPerson[], hostUserId: string | null = 'chris'): LobbyState => ({
  id: 'l',
  name: 'L',
  hostUserId,
  code: 'AAAAAA',
  throwOrder: 'lobby',
  access: 'friends',
  nextGame: null,
  createdAt: new Date(0),
  closedAt: null,
  people,
  invites: [],
  activity: [],
})

const chris = person({
  id: 'c',
  userId: 'chris',
  addedByUserId: 'chris',
  name: 'Christoph',
  boardId: 'living',
  boardOwnerUserId: 'chris',
  position: 0,
})
const lena = person({
  id: 'l',
  userId: 'lena',
  addedByUserId: 'lena',
  name: 'Lena',
  boardId: 'lenas',
  boardOwnerUserId: 'lena',
  position: 1,
  joinedAt: new Date(1),
})
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', position: 2, joinedAt: new Date(2) })
const guest = person({
  id: 'g',
  userId: null,
  addedByUserId: 'lena',
  name: 'Guest 1',
  boardId: 'lenas',
  boardOwnerUserId: 'lena',
  position: 3,
})
const living = { boardId: 'living', ownerUserId: 'chris' }
const garage = { boardId: 'garage', ownerUserId: 'chris' }
const lenas = { boardId: 'lenas', ownerUserId: 'lena' }
const lobby = lobbyOf([chris, lena, max, guest])

describe('canSetBoard', () => {
  it('anyone gives a person on Manual one of their own boards', () => {
    expect(canSetBoard('chris', max, living)).toBe(true)
    expect(canSetBoard('lena', max, lenas)).toBe(true)
  })

  it("nobody gives out a board they don't own", () => {
    expect(canSetBoard('chris', max, lenas)).toBe(false)
    expect(canSetBoard('max', max, living)).toBe(false)
  })

  it("once someone has a board, only they (or a guest's adder) change it; the host has no extra rights", () => {
    expect(canSetBoard('chris', lena, living)).toBe(false)
    expect(canSetBoard('lena', lena, null)).toBe(true)
    expect(canSetBoard('lena', guest, lenas)).toBe(true)
    expect(canSetBoard('chris', guest, living)).toBe(false)
  })

  it("the board's owner takes it back to Manual, from anyone, but can't swap it for another", () => {
    const maxOnLiving = person({ id: 'x', userId: 'max', addedByUserId: 'max', boardId: 'living', boardOwnerUserId: 'chris' })
    expect(canSetBoard('chris', maxOnLiving, null)).toBe(true)
    expect(canSetBoard('lena', maxOnLiving, null)).toBe(false)
    expect(canSetBoard('chris', maxOnLiving, garage)).toBe(false)
  })

  it('only the person moves themselves from Manual to Manual', () => {
    expect(canSetBoard('max', max, null)).toBe(true)
    expect(canSetBoard('chris', max, null)).toBe(false)
  })
})

describe('ready, plays, order, removal', () => {
  it('ready: only the person, not even the host, and never a guest row (the adder has no own-ready row for it)', () => {
    expect(canSetReady('lena', lena)).toBe(true)
    expect(canSetReady('lena', guest)).toBe(false)
    expect(canSetReady('chris', lena)).toBe(false)
  })

  it("effectiveReady: a guest follows their adder's ready, ignoring their own stored flag", () => {
    // guest's adder is lena (ready: true); chris is not ready
    const readyLena = { ...lena, ready: true }
    const notReadyChris = { ...chris, ready: false }
    const l = lobbyOf([notReadyChris, readyLena, { ...guest, ready: false }])
    expect(effectiveReady(l, readyLena)).toBe(true)
    expect(effectiveReady(l, notReadyChris)).toBe(false)
    expect(effectiveReady(l, { ...guest, ready: false })).toBe(true) // lena is ready, guest's own flag ignored
    expect(effectiveReady(l, { ...guest, ready: true })).toBe(true) // same, whatever the stored flag says
    const guestOfChris = { ...guest, addedByUserId: 'chris', ready: true }
    expect(effectiveReady(l, guestOfChris)).toBe(false) // chris isn't ready, so neither is his guest
  })

  it('a bot is always ready, regardless of its stored ready flag or its adder', () => {
    const bot = person({ id: 'b', userId: null, addedByUserId: 'chris', name: 'Bot Lvl 5', ready: false, bot: { level: 5 } })
    const l = lobbyOf([chris, bot])
    expect(effectiveReady(l, bot)).toBe(true)
  })

  it("plays: the person, a guest's adder, or the host", () => {
    expect(canSetPlays(lobby, 'max', max)).toBe(true)
    expect(canSetPlays(lobby, 'lena', guest)).toBe(true)
    expect(canSetPlays(lobby, 'chris', lena)).toBe(true)
    expect(canSetPlays(lobby, 'max', lena)).toBe(false)
  })

  it('only the host reorders', () => {
    expect(canMove(lobby, 'chris')).toBe(true)
    expect(canMove(lobby, 'lena')).toBe(false)
  })

  it('the host removes anyone else; members remove only their own guests; nobody removes themselves', () => {
    expect(canRemove(lobby, 'chris', lena)).toBe(true)
    expect(canRemove(lobby, 'chris', guest)).toBe(true)
    expect(canRemove(lobby, 'lena', guest)).toBe(true)
    expect(canRemove(lobby, 'max', guest)).toBe(false)
    expect(canRemove(lobby, 'lena', max)).toBe(false)
    expect(canRemove(lobby, 'chris', chris)).toBe(false)
  })

  it("a host who isn't in the lobby any more has no host rights", () => {
    expect(isHost(lobbyOf([lena, max], 'chris'), 'chris')).toBe(false)
  })
})

describe('membership changes', () => {
  it('the member who has been in the lobby longest takes over (ties: lobby order)', () => {
    expect(nextHost(lobbyOf([guest, max, lena], null))).toEqual({ userId: 'lena', name: 'Lena' })
    const tied = person({ id: 't', userId: 'sam', addedByUserId: 'sam', name: 'Sam', joinedAt: new Date(1), position: 0 })
    expect(nextHost(lobbyOf([lena, tied], null))).toEqual({ userId: 'sam', name: 'Sam' })
    expect(nextHost(lobbyOf([guest], null))).toBeNull()
  })

  it('excludes the current host, even when they joined first', () => {
    expect(nextHost(lobbyOf([chris, lena, guest], 'chris'))).toEqual({ userId: 'lena', name: 'Lena' })
    expect(nextHost(lobbyOf([chris, guest], 'chris'))).toBeNull()
  })

  it('isSolo: true with just one account, whatever guests or invites come with it', () => {
    expect(isSolo(lobbyOf([chris, guest]))).toBe(true)
    expect(isSolo(lobbyOf([chris, lena, guest]))).toBe(false)
    expect(isSolo(lobbyOf([guest]))).toBe(true)
  })

  it('a member leaves with their guests', () => {
    expect(leavingWith(lobby, 'lena').map(p => p.id)).toEqual(['l', 'g'])
  })

  it('reorders by moving one person to an index (clamped)', () => {
    expect(reorder(lobby.people, 'm', 0)).toEqual(['m', 'c', 'l', 'g'])
    expect(reorder(lobby.people, 'c', 99)).toEqual(['l', 'm', 'g', 'c'])
  })
})

describe('teams', () => {
  const teamsX01 = { gameId: 'x01', config: { format: 'teams' } }

  it('a team game: a game that does teams, with format teams', () => {
    expect(isTeamGame({ nextGame: teamsX01 })).toBe(true)
    expect(isTeamGame({ nextGame: { gameId: 'x01', config: { format: 'singles' } } })).toBe(false)
    expect(isTeamGame({ nextGame: { gameId: 'x01', config: {} } })).toBe(false)
    expect(isTeamGame({ nextGame: { gameId: 'atc', config: { format: 'teams' } } })).toBe(false)
    expect(isTeamGame({ nextGame: null })).toBe(false)
  })

  it('nobody has a team yet: the people who play alternate A, B in lobby order', () => {
    const sitsOut = { ...max, plays: false }
    const sam = person({ id: 's', userId: 'sam', addedByUserId: 'sam', name: 'Sam', position: 4 })
    expect(Object.fromEntries(assignTeams(lobbyOf([chris, lena, sitsOut, guest, sam])))).toEqual({ c: 'A', l: 'B', g: 'A', s: 'B' })
  })

  it("newcomers go to the smaller team, Team A on a tie; sitting out doesn't count", () => {
    const teams = [
      { ...chris, team: 'A' as const },
      { ...lena, team: 'A' as const },
      { ...max, team: 'B' as const },
    ]
    expect(Object.fromEntries(assignTeams(lobbyOf([...teams, guest])))).toEqual({ g: 'B' })
    const sam = person({ id: 's', userId: 'sam', addedByUserId: 'sam', name: 'Sam', position: 4 })
    // A 2, B 1: the guest evens it out, then Sam breaks the tie to A
    expect(Object.fromEntries(assignTeams(lobbyOf([...teams, guest, sam])))).toEqual({ g: 'B', s: 'A' })
    // Lena sits out: A 1, B 1, so the guest goes to A
    const lenaOut = [teams[0], { ...teams[1], plays: false }, teams[2]]
    expect(Object.fromEntries(assignTeams(lobbyOf([...lenaOut, guest])))).toEqual({ g: 'A' })
  })

  it('nothing to assign when everyone who plays has a team', () => {
    expect(
      assignTeams(
        lobbyOf([
          { ...chris, team: 'B' },
          { ...lena, team: 'B' },
        ]),
      ).size,
    ).toBe(0)
  })

  it('a shuffle splits the people who play 50/50; sitting out keeps their team', () => {
    const sam = person({ id: 's', userId: 'sam', addedByUserId: 'sam', name: 'Sam', position: 4 })
    const people = [{ ...chris, team: 'A' as const }, lena, { ...max, plays: false, team: 'B' as const }, guest, sam]
    const shuffled = shuffleTeams(lobbyOf(people), () => 0.99)
    expect([...shuffled.keys()].sort()).toEqual(['c', 'g', 'l', 's'])
    const counts = [...shuffled.values()].reduce((n, t) => ({ ...n, [t]: n[t] + 1 }), { A: 0, B: 0 })
    expect(counts).toEqual({ A: 2, B: 2 })
  })

  it('only the host sets teams', () => {
    expect(canSetTeam(lobby, 'chris')).toBe(true)
    expect(canSetTeam(lobby, 'lena')).toBe(false)
  })
})

describe('friendsMayJoin', () => {
  it('only a friend of the host, only while the lobby is open to friends', () => {
    expect(friendsMayJoin({ access: 'friends', hostUserId: 'chris' }, true)).toBe(true)
    expect(friendsMayJoin({ access: 'friends', hostUserId: 'chris' }, false)).toBe(false)
    expect(friendsMayJoin({ access: 'invite', hostUserId: 'chris' }, true)).toBe(false)
    expect(friendsMayJoin({ access: 'friends', hostUserId: null }, true)).toBe(false)
  })
})
