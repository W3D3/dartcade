// LobbyPeople's Add bot button visibility now derives from the gameModes list's own
// supportsBots field (loaded from the backend) rather than a hardcoded gameId === 'x01'
// check — see backend/src/games/index.ts's supportsBots and backend/src/api/games.ts. Follows
// the same Lobby/LobbyPerson fixture and SSR-render pattern as nextGameHasBot.test.ts.
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
import { gameModes } from '../gameModes'
import LobbyPeople from '../components/lobby/LobbyPeople.svelte'

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
  bot: null,
  ...over,
})
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', ready: true, presence: 'online' })

const baseLobby: Omit<Lobby, 'people' | 'nextGame'> = {
  id: 'l1',
  name: 'Friday darts',
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'friends',
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  invites: [],
  activity: [],
  solo: false,
  nextHostName: null,
}

const noop = () => Promise.resolve(true)
const props = {
  viewerId: 'chris',
  ownBoards: [],
  onupdate: noop,
  onremove: noop,
  onguest: noop,
  onbot: noop,
  oninvite: noop,
}

describe('LobbyPeople: Add bot shown only when the next game supports bots', () => {
  it('shows Add bot when the gameModes entry for the next game says supportsBots: true', () => {
    gameModes.set([{ id: 'x01', defaultConfig: {}, configMeta: {}, teams: true, supportsBots: true }])
    const lobby: Lobby = { ...baseLobby, people: [chris], nextGame: { gameId: 'x01', config: {} } }
    const out = render(LobbyPeople, { props: { lobby, ...props } }).body
    expect(out).toContain('Add bot')
  })

  it('hides Add bot when the next game is one that does not support bots', () => {
    gameModes.set([{ id: 'atc', defaultConfig: {}, configMeta: {}, teams: false, supportsBots: false }])
    const lobby: Lobby = { ...baseLobby, people: [chris], nextGame: { gameId: 'atc', config: {} } }
    const out = render(LobbyPeople, { props: { lobby, ...props } }).body
    expect(out).not.toContain('Add bot')
  })

  it('hides Add bot when no next game is picked yet', () => {
    gameModes.set([{ id: 'x01', defaultConfig: {}, configMeta: {}, teams: true, supportsBots: true }])
    const lobby: Lobby = { ...baseLobby, people: [chris], nextGame: null }
    const out = render(LobbyPeople, { props: { lobby, ...props } }).body
    expect(out).not.toContain('Add bot')
  })
})
