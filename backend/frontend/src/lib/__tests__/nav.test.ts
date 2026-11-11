import { describe, it, expect } from 'vitest'
import { friendsEntry, navTabs, isActiveRoute, railLobby, railTabs, sideLinks } from '../nav.js'

describe('navTabs', () => {
  it('follows the design: Play, Tournaments, History (no Boards, no Live)', () => {
    expect(navTabs().map(t => t.label)).toEqual(['Play', 'Tournaments', 'History'])
  })
  it('shows Tournaments as not there yet', () => {
    expect(navTabs()[1]).toMatchObject({ label: 'Tournaments', disabled: true })
  })
  it('links Tournaments while its flag is on, beside Progress', () => {
    expect(navTabs({ tournaments: true })[1]).toEqual({ href: '/tournaments', label: 'Tournaments', icon: 'tournaments' })
    expect(navTabs({ progress: 0, tournaments: true }).map(t => t.label)).toEqual(['Play', 'Progress', 'Tournaments', 'History'])
    expect(railTabs({ tournaments: true }).find(t => t.label === 'Tournaments')).not.toHaveProperty('disabled')
  })

  it('puts Ranked after Play while matchmaking is on', () => {
    expect(navTabs({ ranked: true }).map(t => t.label)).toEqual(['Play', 'Ranked', 'Tournaments', 'History'])
    expect(navTabs({ ranked: true })[1]).toEqual({ href: '/matchmaking', label: 'Ranked', icon: 'ranked', aria: 'Matchmaking' })
  })

  it('puts Coach after Ranked while the coach is on', () => {
    expect(navTabs({ ranked: true, progress: 0, home: true, coach: true }).map(t => t.label)).toEqual([
      'Home',
      'Play',
      'Ranked',
      'Coach',
      'Progress',
      'History',
    ])
    expect(navTabs({ coach: true })[1]).toEqual({ href: '/coach', label: 'Coach', icon: 'coach' })
    expect(navTabs({ ranked: true, progress: 0, home: true }).map(t => t.label)).not.toContain('Coach')
  })

  it('puts the pending invites on the Play tab', () => {
    expect(navTabs({ invites: 2 })[0]).toEqual({ href: '/play', label: 'Play', icon: 'play', badge: 2, badgeLabel: '2 pending invites' })
    expect(navTabs()[0]).toEqual({ href: '/play', label: 'Play', icon: 'play' })
  })
})

describe('Home in the nav', () => {
  it('puts Home first, before Play, while Home is on', () => {
    expect(navTabs({ home: true }).map(t => [t.label, t.href])).toEqual([
      ['Home', '/'],
      ['Play', '/play'],
      ['Tournaments', '/tournaments'],
      ['History', '/history'],
    ])
    expect(navTabs({ home: true })[0]).toEqual({ href: '/', label: 'Home', icon: 'home' })
  })

  it('keeps the invites badge on Play', () => {
    expect(navTabs({ invites: 2, home: true })[1]).toMatchObject({ label: 'Play', href: '/play', badge: 2 })
    expect(navTabs({ invites: 2, home: true })[0]).not.toHaveProperty('badge')
  })

  it('is the old nav without it: no Home, Play first (always at /play)', () => {
    expect(navTabs().map(t => [t.label, t.href])[0]).toEqual(['Play', '/play'])
  })

  it('shows in the tablet rail and the desktop side nav too', () => {
    expect(
      railTabs({ home: true })
        .map(t => t.label)
        .slice(0, 2),
    ).toEqual(['Home', 'Play'])
    expect(
      sideLinks('s1', { home: true })
        .map(l => [l.label, l.href])
        .slice(0, 2),
    ).toEqual([
      ['Home', '/'],
      ['Play', '/play'],
    ])
  })

  it('tells Home from Play by the route', () => {
    expect(isActiveRoute('/', '/')).toBe(true)
    expect(isActiveRoute('/play', '/')).toBe(false)
    expect(isActiveRoute('/play', '/play')).toBe(true)
  })
})

describe('Progress in the nav', () => {
  it('takes the Tournaments tab while progression is on', () => {
    expect(navTabs({ ranked: true, progress: 0 }).map(t => t.label)).toEqual(['Play', 'Ranked', 'Progress', 'History'])
    expect(navTabs({ progress: 0 })[1]).toEqual({ href: '/progress', label: 'Progress', icon: 'progress' })
  })
  it('counts the challenges to claim', () => {
    expect(navTabs({ progress: 2 })[1]).toMatchObject({ badge: 2, badgeLabel: '2 challenges to claim' })
    expect(
      sideLinks('s1', { ranked: true, coach: true })
        .map(l => l.label)
        .slice(0, 3),
    ).toEqual(['Play', 'Matchmaking', 'Coach'])
    expect(sideLinks('s1', { ranked: true, coach: true }).find(l => l.label === 'Coach')).toEqual({
      href: '/coach',
      label: 'Coach',
      icon: 'coach',
    })
    expect(sideLinks('s1').some(l => l.label === 'Coach')).toBe(false)
    expect(sideLinks('s1', { progress: 1 }).find(l => l.label === 'Progress')).toMatchObject({ badge: 1 })
  })
  it('lists Stats after History while it is on, and on the rail before Settings', () => {
    expect(sideLinks('s1', { progress: 0, stats: true }).map(l => l.label)).toEqual([
      'Play',
      'Live match',
      'Tournaments',
      'History',
      'Stats',
      'Progress',
      'Settings',
    ])
    expect(railTabs({ stats: true }).map(t => t.label)).toEqual(['Play', 'Tournaments', 'History', 'Stats', 'Settings'])
    expect(sideLinks('s1').some(l => l.label === 'Stats')).toBe(false)
  })
  it('sits before Settings in the side nav', () => {
    expect(sideLinks('s1', { progress: 0 }).map(l => l.label)).toEqual([
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
    expect(sideLinks('s1', { ranked: true }).map(l => l.label)).toEqual([
      'Play',
      'Matchmaking',
      'Live match',
      'Tournaments',
      'History',
      'Settings',
    ])
  })
  it('dims Tournaments as soon while its flag is off, and links it once on', () => {
    expect(sideLinks('s1').find(l => l.label === 'Tournaments')).toMatchObject({ disabled: true, soon: true })
    expect(sideLinks('s1', { tournaments: true }).find(l => l.label === 'Tournaments')).toEqual({
      href: '/tournaments',
      label: 'Tournaments',
      icon: 'tournaments',
    })
  })
  it('links Live match to the running game, disabled without one', () => {
    expect(sideLinks('s1')[1]).toEqual({ href: '/session/s1', label: 'Live match', icon: 'live' })
    expect(sideLinks(null)[1]).toMatchObject({ label: 'Live match', disabled: true })
  })
  it('adds Admin last, admins only', () => {
    expect(sideLinks(null, { admin: true }).map(l => l.label)).toEqual([
      'Play',
      'Live match',
      'Tournaments',
      'History',
      'Settings',
      'Admin',
    ])
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
    expect(railTabs().map(t => t.label)).toEqual(['Play', 'Tournaments', 'History', 'Settings'])
    expect(railTabs({ admin: true }).slice(-2)).toEqual([
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/admin', label: 'Admin', icon: 'admin' },
    ])
  })
})
