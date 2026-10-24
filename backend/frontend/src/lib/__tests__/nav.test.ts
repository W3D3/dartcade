import { describe, it, expect } from 'vitest'
import { friendsEntry, navTabs, isActiveRoute, railLobby, railTabs, sideLinks } from '../nav.js'

describe('navTabs', () => {
  it('follows the design: Play, Live, Tournaments, History (no Boards)', () => {
    expect(navTabs('s1').map(t => t.label)).toEqual(['Play', 'Live', 'Tournaments', 'History'])
  })
  it('links Live to the running game', () => {
    expect(navTabs('s1')[1]).toEqual({ href: '/session/s1', label: 'Live', icon: 'live' })
  })
  it('keeps Live in place but disabled without a running game', () => {
    expect(navTabs(null)[1]).toMatchObject({ label: 'Live', disabled: true, aria: 'Live: no game running' })
  })
  it('shows Tournaments as not there yet', () => {
    expect(navTabs('s1')[2]).toMatchObject({ label: 'Tournaments', disabled: true })
  })

  it('puts Ranked after Play while matchmaking is on', () => {
    expect(navTabs('s1', 0, true).map(t => t.label)).toEqual(['Play', 'Ranked', 'Live', 'Tournaments', 'History'])
    expect(navTabs(null, 0, true)[1]).toEqual({ href: '/matchmaking', label: 'Ranked', icon: 'ranked', aria: 'Matchmaking' })
  })

  it('puts the pending invites on the Play tab', () => {
    expect(navTabs(null, 2)[0]).toEqual({ href: '/', label: 'Play', icon: 'play', badge: 2, badgeLabel: '2 pending invites' })
    expect(navTabs(null, 0)[0]).toEqual({ href: '/', label: 'Play', icon: 'play' })
  })
})

describe('Progress in the nav', () => {
  it('takes the Tournaments tab while progression is on', () => {
    expect(navTabs('s1', 0, true, 0).map(t => t.label)).toEqual(['Play', 'Ranked', 'Live', 'Progress', 'History'])
    expect(navTabs('s1', 0, false, 0)[2]).toEqual({ href: '/progress', label: 'Progress', icon: 'progress' })
  })
  it('counts the challenges to claim', () => {
    expect(navTabs('s1', 0, false, 2)[2]).toMatchObject({ badge: 2, badgeLabel: '2 challenges to claim' })
    expect(sideLinks('s1', false, false, 1).find(l => l.label === 'Progress')).toMatchObject({ badge: 1 })
  })
  it('sits before Settings in the side nav', () => {
    expect(sideLinks('s1', false, false, 0).map(l => l.label)).toEqual([
      'Play',
      'Live match',
      'Tournaments',
      'History',
      'Progress',
      'Settings',
    ])
  })
})

describe('sideLinks', () => {
  it('lists the design order, with Matchmaking only while it is on', () => {
    expect(sideLinks('s1').map(l => l.label)).toEqual(['Play', 'Live match', 'Tournaments', 'History', 'Settings'])
    expect(sideLinks('s1', true).map(l => l.label)).toEqual(['Play', 'Matchmaking', 'Live match', 'Tournaments', 'History', 'Settings'])
  })
  it('links Live match to the running game, disabled without one', () => {
    expect(sideLinks('s1')[1]).toEqual({ href: '/session/s1', label: 'Live match', icon: 'live' })
    expect(sideLinks(null)[1]).toMatchObject({ label: 'Live match', disabled: true })
  })
  it('adds Admin last, admins only', () => {
    expect(sideLinks(null, false, true).map(l => l.label)).toEqual(['Play', 'Live match', 'Tournaments', 'History', 'Settings', 'Admin'])
    expect(sideLinks(null).map(l => l.label)).not.toContain('Admin')
  })
})

describe('isActiveRoute', () => {
  it('matches the route, and the empty location as Play', () => {
    expect(isActiveRoute('/', '/')).toBe(true)
    expect(isActiveRoute('', '/')).toBe(true)
    expect(isActiveRoute('/boards', '/')).toBe(false)
    expect(isActiveRoute('/session/s1', '/session/s1')).toBe(true)
  })
  it('keeps a section active on the pages under it', () => {
    expect(isActiveRoute('/matchmaking/ranks', '/matchmaking')).toBe(true)
    expect(isActiveRoute('/matchmakingx', '/matchmaking')).toBe(false)
    expect(isActiveRoute('/matchmaking', '/')).toBe(false)
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
    faces: [],
  }

  it('nothing before we know who you are', () => {
    expect(railLobby(null, false)).toBeNull()
  })
  it('creates a lobby while you are in none', () => {
    expect(railLobby(null, true)).toEqual({ kind: 'create', label: 'Lobby', aria: 'Create lobby' })
  })
  it('your lobby with its head count; the aria label says the name and what is next', () => {
    expect(railLobby(s, true)).toEqual({
      kind: 'in',
      href: '/lobby',
      label: 'Lobby · 6',
      aria: "You're in the lobby Friday darts. 6 people · Next: X01. Open the lobby",
    })
  })
  it('a solo lobby shows like any other', () => {
    expect(railLobby({ ...s, solo: true }, true)).toMatchObject({ kind: 'in', href: '/lobby', label: 'Lobby · 6' })
  })
})

describe('friendsEntry', () => {
  it('counts requests for you and friends online, for the badge and its label', () => {
    expect(friendsEntry(null)).toEqual({ requests: 0, online: 0, aria: 'Friends: 0 online, 0 friend requests' })
    const list = { friends: [{ status: { kind: 'online' } }, { status: { kind: 'offline' } }], incoming: [{}], outgoing: [] }
    expect(friendsEntry(list as any)).toEqual({ requests: 1, online: 1, aria: 'Friends: 1 online, 1 friend request' })
  })
})

describe('railTabs', () => {
  it("adds Settings, and Admin for admins, after the phone's tabs", () => {
    expect(railTabs('s1').map(t => t.label)).toEqual(['Play', 'Live', 'Tournaments', 'History', 'Settings'])
    expect(railTabs('s1', 0, false, null, true).slice(-2)).toEqual([
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/admin', label: 'Admin', icon: 'admin' },
    ])
  })
})
