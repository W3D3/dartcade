// The lobby header while solo: the host can close the lobby (it's always visible now), but there's
// nobody to hand it to, so no Leave; the code sits in the Invite friends panel instead.
import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import type { Lobby, LobbyPerson } from '../api/lobby-ws'
import LobbyHeader from '../components/lobby/LobbyHeader.svelte'

// JoinCodeCard's tooltip pulls in bits-ui's barrel, which crashes SSR here (see lobbyAccessPanel.test.ts)
vi.mock('bits-ui', () => ({
  Tooltip: { Root: () => {}, Trigger: () => {}, Portal: () => {}, Content: () => {} },
  Dialog: {
    Root: () => {},
    Trigger: () => {},
    Portal: () => {},
    Content: () => {},
    Overlay: () => {},
    Title: () => {},
    Description: () => {},
  },
}))

const member = (id: string, name: string): LobbyPerson => ({
  id,
  userId: id,
  addedByUserId: id,
  name,
  boardId: null,
  boardName: null,
  boardOwnerUserId: null,
  boardOnline: false,
  boardMovedBy: null,
  usualBoardName: null,
  plays: true,
  ready: false,
  team: null,
  presence: 'online',
  bot: null,
})

const lobbyOf = (people: LobbyPerson[], solo: boolean): Lobby => ({
  id: 'l1',
  name: "Christoph's lobby",
  code: 'K7Q4MD',
  hostUserId: 'chris',
  hostName: 'Christoph',
  throwOrder: 'lobby',
  access: 'invite',
  nextGame: null,
  currentSessionId: null,
  createdAt: '2026-10-02T19:40:00.000Z',
  people,
  invites: [],
  activity: [],
  solo,
  nextHostName: 'Lena',
})

const header = (lobby: Lobby, viewerId: string) =>
  render(LobbyHeader, {
    props: { lobby, viewerId, onrename: () => Promise.resolve(true), onnewcode: () => {}, onclose: () => {}, onleave: () => {} },
  }).body

describe('LobbyHeader while solo', () => {
  it('the host gets Close lobby, no Leave', () => {
    const out = header(lobbyOf([member('chris', 'Christoph')], true), 'chris')
    expect(out).toContain('Close lobby')
    expect(out).not.toContain('Leave lobby')
  })

  it('a shared lobby keeps Leave and Close for the host', () => {
    const out = header(lobbyOf([member('chris', 'Christoph'), member('lena', 'Lena')], false), 'chris')
    expect(out).toContain('Close lobby')
    expect(out).toContain('Leave lobby')
  })
})
