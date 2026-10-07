// While the lobby is solo (one account; guests and bots don't count) ready means nothing: every
// row is the viewer's or their guests'. The people list shows no ready chips, badges or count
// then, and shows them again once a second account is in (spec: 2026-10-08-visible-lobby).
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
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
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', presence: 'online' })
const guest = person({ id: 'g', name: 'Guest 1', ready: true })
const sitsOut = person({ id: 's', name: 'Guest 2', plays: false })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', presence: 'online' })

const lobbyOf = (people: LobbyPerson[], solo: boolean): Lobby => ({
  id: 'l1',
  name: "Christoph's lobby",
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'invite',
  nextGame: { gameId: 'x01', config: {} },
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  people,
  invites: [],
  activity: [],
  solo,
  nextHostName: null,
})

const noop = () => Promise.resolve(true)
const props = { viewerId: 'chris', ownBoards: [], onupdate: noop, onremove: noop, onguest: noop, onbot: noop, oninvite: noop }
const page = (lobby: Lobby) => render(LobbyPeople, { props: { ...props, lobby } }).body
const READY = /\bready\b|Ready\?/i

describe('ready states while solo', () => {
  it('a solo lobby shows no ready chip, badge or count; sitting out still shows', () => {
    const out = page(lobbyOf([chris, guest, sitsOut], true))
    expect(out).not.toMatch(READY)
    expect(out).toContain('Sits out')
    expect(out).toContain('playing')
  })

  it('once a second account is in, ready shows again', () => {
    const out = page(lobbyOf([chris, guest, lena], false))
    expect(out).toContain('Ready?')
    expect(out).toContain('Not ready')
    expect(out).toMatch(/of 3<\/strong>.*ready/s)
  })
})
