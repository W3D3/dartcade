import { describe, it, expect } from 'vitest'
import {
  alreadyInOrInvited,
  boardChoices,
  boardSummary,
  hasBullOff,
  canMove,
  canRemove,
  canSetPlays,
  canSetReady,
  counts,
  isHost,
  isMine,
  isTeamFormat,
  myRow,
  nextGameInTeams,
  playsInGame,
  teamRosters,
  teamsMessage,
} from '../lobby/rules.js'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p',
  userId: null,
  addedByUserId: 'chris',
  name: 'X',
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays: true,
  ready: false,
  team: null,
  presence: null,
  ...over,
})
const chris = person({
  id: 'c',
  userId: 'chris',
  addedByUserId: 'chris',
  name: 'Christoph',
  boardId: 'living',
  boardName: 'Living room',
  boardOwnerUserId: 'chris',
  ready: true,
  presence: 'online',
})
const lena = person({
  id: 'l',
  userId: 'lena',
  addedByUserId: 'lena',
  name: 'Lena',
  boardId: 'lenas',
  boardName: "Lena's place",
  boardOwnerUserId: 'lena',
  presence: 'away',
})
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', plays: false })
const pia = person({
  id: 'g',
  name: 'Pia',
  addedByUserId: 'lena',
  boardId: 'lenas',
  boardName: "Lena's place",
  boardOwnerUserId: 'lena',
  ready: true,
})
const lobby: Lobby = {
  id: 'l1',
  name: 'Friday darts',
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'friends',
  nextGame: null,
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  people: [chris, lena, max, pia],
  invites: [],
  activity: [],
  solo: false,
  nextHostName: 'Lena',
}
const own = [
  { id: 'living', name: 'Living room' },
  { id: 'garage', name: 'Garage' },
]

describe('lobby rules for the screens', () => {
  it('knows the host and your own rows', () => {
    expect(isHost(lobby, 'chris')).toBe(true)
    expect(isHost(lobby, 'lena')).toBe(false)
    expect(isHost(lobby, null)).toBe(false)
    expect(isHost({ ...lobby, people: [lena, max, pia] }, 'chris')).toBe(false)
    expect(myRow(lobby, 'lena')?.id).toBe('l')
    expect(myRow(lobby, 'sam')).toBeNull()
    expect([chris, lena, max, pia].filter(p => isMine(p, 'lena')).map(p => p.id)).toEqual(['l', 'g'])
  })

  it('ready: only your own rows, not even the host for others; never a guest row', () => {
    expect(canSetReady(lena, 'lena')).toBe(true)
    expect(canSetReady(pia, 'lena')).toBe(false)
    expect(canSetReady(lena, 'chris')).toBe(false)
  })

  it('who plays: your own rows, or anyone for the host', () => {
    expect(canSetPlays(lobby, pia, 'lena')).toBe(true)
    expect(canSetPlays(lobby, max, 'chris')).toBe(true)
    expect(canSetPlays(lobby, max, 'lena')).toBe(false)
  })

  it("order is the host's; members remove only their own guests, nobody removes themselves", () => {
    expect(canMove(lobby, 'chris')).toBe(true)
    expect(canMove(lobby, 'lena')).toBe(false)
    expect(canRemove(lobby, max, 'chris')).toBe(true)
    expect(canRemove(lobby, chris, 'chris')).toBe(false)
    expect(canRemove(lobby, pia, 'lena')).toBe(true)
    expect(canRemove(lobby, max, 'lena')).toBe(false)
  })

  it('board menu: your own boards for someone on Manual', () => {
    const c = boardChoices(max, 'chris', own)
    expect(c.map(b => [b.boardId, b.label, b.current])).toEqual([
      ['living', 'Living room', false],
      ['garage', 'Garage', false],
    ])
  })

  it('board menu: once someone has a board, only they change it, and its owner takes it back', () => {
    // Lena on her own board: Chris can't move her
    expect(boardChoices(lena, 'chris', own)).toEqual([])
    // Lena herself: Manual and her own boards
    expect(boardChoices(lena, 'lena', [{ id: 'lenas', name: "Lena's place" }]).map(b => [b.boardId, b.current])).toEqual([
      [null, false],
      ['lenas', true],
    ])
    // Chris put Max on his board: as the owner he can take it back, not swap it
    const onChris = { ...max, boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris' }
    expect(boardChoices(onChris, 'chris', own).map(b => b.boardId)).toEqual([null])
    expect(boardChoices(onChris, 'chris', own)[0]).toMatchObject({ label: 'Manual entry', detail: 'Take Living room back' })
  })

  it('counts people, who plays and who is ready; names the boards in use', () => {
    expect(counts(lobby)).toEqual({ people: 4, playing: 3, ready: 2 })
    expect(boardSummary(lobby)).toBe("Living room, Lena's place")
    expect(boardSummary({ ...lobby, people: [{ ...max, plays: true }] })).toBe('Manual entry')
  })

  it('knows whether you play in the next game, yourself or through a guest', () => {
    expect(playsInGame(lobby, 'lena')).toBe(true)
    expect(playsInGame(lobby, 'max')).toBe(false)
    expect(playsInGame({ ...lobby, people: [chris, { ...lena, plays: false }, pia] }, 'lena')).toBe(true)
  })

  it("knows which games have a bull off from their defaults (people are the server's to count)", () => {
    expect(hasBullOff({ defaultConfig: { startScore: 501, bullOff: 'off' } })).toBe(true)
    expect(hasBullOff({ defaultConfig: { order: 'asc', finishOn: 'bull' } })).toBe(false)
    expect(hasBullOff(undefined)).toBe(false)
  })

  it('lists the accounts already in the lobby or invited, so the add field skips them', () => {
    const invited = {
      ...lobby,
      invites: [{ id: 'i1', userId: 'phil', name: 'Phil', invitedByUserId: 'chris', createdAt: '2026-10-02T19:41:00.000Z' }],
    }
    expect(alreadyInOrInvited(invited)).toEqual(['chris', 'lena', 'max', 'phil'])
  })

  it('is a team format only when the mode supports teams and the config picked it', () => {
    expect(isTeamFormat(true, { format: 'teams' })).toBe(true)
    expect(isTeamFormat(true, { format: 'singles' })).toBe(false)
    expect(isTeamFormat(false, { format: 'teams' })).toBe(false)
    expect(isTeamFormat(undefined, { format: 'teams' })).toBe(false)
  })

  it("the lobby's next game is in teams: its mode does teams and its settings (over the defaults) pick them", () => {
    const modes = [
      { id: 'x01', teams: true, defaultConfig: { format: 'singles' } },
      { id: 'atc', teams: false, defaultConfig: {} },
    ]
    const next = (gameId: string, config: Record<string, unknown>): Lobby => ({ ...lobby, nextGame: { gameId, config } })
    expect(nextGameInTeams(next('x01', { format: 'teams' }), modes)).toBe(true)
    expect(nextGameInTeams(next('x01', {}), modes)).toBe(false)
    expect(nextGameInTeams(next('x01', {}), [{ ...modes[0], defaultConfig: { format: 'teams' } }])).toBe(true)
    expect(nextGameInTeams(next('atc', { format: 'teams' }), modes)).toBe(false)
    expect(nextGameInTeams(lobby, modes)).toBe(false)
  })

  it('splits the people who play into Team A and Team B, in lobby order', () => {
    const a = { ...chris, team: 'A' as const }
    const b1 = { ...lena, team: 'B' as const }
    const b2 = { ...pia, team: 'B' as const }
    const sitsOut = { ...max, plays: false, team: 'A' as const }
    expect(teamRosters({ ...lobby, people: [a, b1, b2, sitsOut] })).toEqual({ a: [a], b: [b1, b2] })
  })

  it("says when a team needs a player, or the split is uneven; nothing once it's even", () => {
    expect(teamsMessage(0, 2)).toBe('Both teams need a player.')
    expect(teamsMessage(2, 0)).toBe('Both teams need a player.')
    expect(teamsMessage(1, 2)).toBe("Teams are uneven. The smaller team's players throw more often.")
    expect(teamsMessage(2, 2)).toBeNull()
  })
})
