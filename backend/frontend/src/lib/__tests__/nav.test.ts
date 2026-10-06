import { describe, it, expect } from 'vitest'
import { friendsEntry, navTabs, isActiveRoute, railLobby } from '../nav.js'

describe('navTabs', () => {
  it('has no Live tab without a running game', () => {
    expect(navTabs(null).map(t => t.label)).toEqual(['Play', 'Boards', 'History'])
  })
  it('puts Live second, linking to the running game', () => {
    const tabs = navTabs('s1')
    expect(tabs.map(t => t.label)).toEqual(['Play', 'Live', 'Boards', 'History'])
    expect(tabs[1]).toEqual({ href: '/session/s1', label: 'Live', icon: 'live' })
  })

  it('puts the pending invites on the Play tab', () => {
    expect(navTabs(null, 2)[0]).toEqual({ href: '/', label: 'Play', icon: 'play', badge: 2 })
    expect(navTabs(null, 0)[0]).toEqual({ href: '/', label: 'Play', icon: 'play' })
  })
})

describe('isActiveRoute', () => {
  it('matches the route, and the empty location as Play', () => {
    expect(isActiveRoute('/', '/')).toBe(true)
    expect(isActiveRoute('', '/')).toBe(true)
    expect(isActiveRoute('/boards', '/')).toBe(false)
    expect(isActiveRoute('/session/s1', '/session/s1')).toBe(true)
  })
})

describe('railLobby', () => {
  const s = {
    id: 'l1',
    name: 'Friday darts',
    hostName: 'Christoph',
    peopleCount: 6,
    nextGame: { gameId: 'x01', config: {} },
    sessionId: null,
    gameId: null,
    youThrowNext: false,
    leg: null,
    youHost: true,
    solo: false,
    hasBot: false,
  }

  it('nothing before we know who you are', () => {
    expect(railLobby(null, false)).toBeNull()
  })
  it('creates a lobby while you are in none', () => {
    expect(railLobby(null, true)).toEqual({ kind: 'create', label: 'Lobby', aria: 'Create lobby' })
  })
  it('your lobby by name, with what is next', () => {
    expect(railLobby(s, true)).toEqual({
      kind: 'in',
      href: '/lobby',
      label: 'Friday darts',
      aria: "You're in the lobby Friday darts. 6 people · Next: X01. Open the lobby",
    })
  })
  it('a solo lobby is a quiet way to invite friends', () => {
    expect(railLobby({ ...s, solo: true }, true)).toEqual({
      kind: 'solo',
      href: '/lobby',
      label: 'Lobby',
      aria: 'Play with friends: open the lobby',
    })
  })
})

describe('friendsEntry', () => {
  it('counts requests for you and friends online, for the badge and its label', () => {
    expect(friendsEntry(null)).toEqual({ requests: 0, online: 0, aria: 'Friends: 0 online, 0 friend requests' })
    const list = { friends: [{ status: { kind: 'online' } }, { status: { kind: 'offline' } }], incoming: [{}], outgoing: [] }
    expect(friendsEntry(list as any)).toEqual({ requests: 1, online: 1, aria: 'Friends: 1 online, 1 friend request' })
  })
})
