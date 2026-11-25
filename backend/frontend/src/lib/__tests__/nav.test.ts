import { describe, it, expect } from 'vitest'
import {
  activeTab,
  friendsEntry,
  menuSections,
  mostSpecific,
  navTabs,
  isActiveRoute,
  playTabs,
  railLobby,
  railTabs,
  sideLinks,
  statsTabs,
} from '../nav.js'

const labels = (links: { label: string }[]) => links.map(l => l.label)

describe('navTabs', () => {
  it('follows the design: Play, Tournaments, Stats (no Boards, no Live, no Ranked, no History)', () => {
    expect(labels(navTabs())).toEqual(['Play', 'Tournaments', 'Stats'])
  })
  it('shows Tournaments as not there yet', () => {
    expect(navTabs()[1]).toMatchObject({ label: 'Tournaments', disabled: true })
  })
  it('links Tournaments while its flag is on, beside Progress', () => {
    expect(navTabs({ tournaments: true })[1]).toEqual({ href: '/tournaments', label: 'Tournaments', icon: 'tournaments' })
    expect(labels(navTabs({ progress: 0, tournaments: true }))).toEqual(['Play', 'Progress', 'Tournaments', 'Stats'])
    expect(railTabs({ tournaments: true }).find(t => t.label === 'Tournaments')).not.toHaveProperty('disabled')
  })

  it('puts Coach after Play while the coach is on', () => {
    expect(labels(navTabs({ progress: 0, home: true, coach: true }))).toEqual(['Home', 'Play', 'Coach', 'Progress', 'Stats'])
    expect(navTabs({ coach: true })[1]).toEqual({ href: '/coach', label: 'Coach', icon: 'coach' })
    expect(labels(navTabs({ progress: 0, home: true }))).not.toContain('Coach')
  })

  it('puts the pending invites on the Play tab', () => {
    expect(navTabs({ invites: 2 })[0]).toEqual({ href: '/play', label: 'Play', icon: 'play', badge: 2, badgeLabel: '2 pending invites' })
    expect(navTabs()[0]).toEqual({ href: '/play', label: 'Play', icon: 'play' })
  })

  it('opens Stats on its Overview while stats are on, else on History', () => {
    expect(navTabs({ stats: true }).at(-1)).toEqual({ href: '/stats', label: 'Stats', icon: 'stats' })
    expect(navTabs().at(-1)).toEqual({ href: '/stats/history', label: 'Stats', icon: 'stats' })
  })
})

describe('Home in the nav', () => {
  it('puts Home first, before Play, while Home is on', () => {
    expect(navTabs({ home: true }).map(t => [t.label, t.href])).toEqual([
      ['Home', '/'],
      ['Play', '/play'],
      ['Tournaments', '/tournaments'],
      ['Stats', '/stats/history'],
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
    expect(labels(railTabs({ home: true })).slice(0, 2)).toEqual(['Home', 'Play'])
    expect(
      sideLinks({ home: true })
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
    expect(labels(navTabs({ progress: 0 }))).toEqual(['Play', 'Progress', 'Stats'])
    expect(navTabs({ progress: 0 })[1]).toEqual({ href: '/progress', label: 'Progress', icon: 'progress' })
  })
  it('counts the challenges to claim', () => {
    expect(navTabs({ progress: 2 })[1]).toMatchObject({ badge: 2, badgeLabel: '2 challenges to claim' })
    expect(sideLinks({ progress: 1 }).find(l => l.label === 'Progress')).toMatchObject({ badge: 1 })
  })
  it('sits after Stats, before Settings, in the side nav', () => {
    expect(labels(sideLinks({ progress: 0 }))).toEqual(['Play', 'Tournaments', 'Stats', 'Progress', 'Settings'])
  })
})

describe('sideLinks', () => {
  it('lists the design order: one Stats, and no Matchmaking or History (tabs of Play and Stats)', () => {
    expect(labels(sideLinks())).toEqual(['Play', 'Tournaments', 'Stats', 'Settings'])
    const all = sideLinks({ home: true, coach: true, stats: true, progress: 0, tournaments: true, admin: true })
    expect(labels(all)).toEqual(['Home', 'Play', 'Coach', 'Tournaments', 'Stats', 'Progress', 'Settings', 'Admin'])
    expect(all.find(l => l.label === 'Coach')).toEqual({ href: '/coach', label: 'Coach', icon: 'coach' })
  })
  it('dims Tournaments as soon while its flag is off, and links it once on', () => {
    expect(sideLinks().find(l => l.label === 'Tournaments')).toMatchObject({ disabled: true, soon: true })
    expect(sideLinks({ tournaments: true }).find(l => l.label === 'Tournaments')).toEqual({
      href: '/tournaments',
      label: 'Tournaments',
      icon: 'tournaments',
    })
  })
  it('adds Admin last, admins only', () => {
    expect(labels(sideLinks({ admin: true }))).toEqual(['Play', 'Tournaments', 'Stats', 'Settings', 'Admin'])
    expect(labels(sideLinks())).not.toContain('Admin')
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
    expect(isActiveRoute('/play/ranked/ranks', '/play')).toBe(true)
    expect(isActiveRoute('/stats/history/g1', '/stats')).toBe(true)
    expect(isActiveRoute('/playx', '/play')).toBe(false)
    expect(isActiveRoute('/stats', '/')).toBe(false)
  })
})

describe('playTabs', () => {
  it('is New game alone while matchmaking and missions are off', () => {
    expect(playTabs()).toEqual([{ path: '/play', href: '#/play', label: 'New game', icon: 'new-game' }])
  })
  it('adds Ranked and Missions, each while its flag is on', () => {
    expect(labels(playTabs({ ranked: true, missions: true }))).toEqual(['New game', 'Ranked', 'Missions'])
    expect(labels(playTabs({ missions: true }))).toEqual(['New game', 'Missions'])
    expect(playTabs({ ranked: true })[1]).toMatchObject({ path: '/play/ranked', href: '#/play/ranked' })
  })
})

describe('statsTabs', () => {
  it('is Overview and History while stats are on, History alone while off', () => {
    expect(labels(statsTabs(true))).toEqual(['Overview', 'History'])
    expect(labels(statsTabs(false))).toEqual(['History'])
  })
  it('links History with the filter it was left with', () => {
    expect(statsTabs(true, '#/stats/history?mode=x01')[1]).toMatchObject({ path: '/stats/history', href: '#/stats/history?mode=x01' })
  })
})

describe('activeTab', () => {
  const play = playTabs({ ranked: true, missions: true })
  const stats = statsTabs(true)
  it('picks the tab whose route is the longest the location is at or under', () => {
    expect(activeTab('/play', play)?.label).toBe('New game')
    expect(activeTab('/play/ranked', play)?.label).toBe('Ranked')
    expect(activeTab('/play/ranked/ranks', play)?.label).toBe('Ranked')
    expect(activeTab('/play/missions/friends', play)?.label).toBe('Missions')
    expect(activeTab('/stats', stats)?.label).toBe('Overview')
    expect(activeTab('/stats/history', stats)?.label).toBe('History')
  })
  it('is none off the hub', () => {
    expect(activeTab('/settings', play)).toBeUndefined()
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
    expect(labels(railTabs())).toEqual(['Play', 'Tournaments', 'Stats', 'Settings'])
    expect(railTabs({ admin: true }).slice(-2)).toEqual([
      { href: '/settings', label: 'Settings', icon: 'settings' },
      { href: '/admin', label: 'Admin', icon: 'admin' },
    ])
  })
})

describe('menuSections', () => {
  const names = (nav = {}) => menuSections(nav).map(s => [s.label, labels(s.links)])

  it('lists the side nav pages with Home ungrouped first, plus the Matchmaking and History shortcuts; no Progress, Friends or Boards', () => {
    const all = { home: true, ranked: true, coach: true, tournaments: true, stats: true, progress: 0, admin: true }
    expect(names(all)).toEqual([
      [null, ['Home']],
      ['Play', ['Play', 'Matchmaking', 'Coach', 'Tournaments']],
      ['You', ['Stats', 'History']],
      ['Account', ['Settings', 'Admin']],
    ])
    const links = menuSections(all).flatMap(s => s.links)
    expect(links.find(l => l.label === 'Matchmaking')).toEqual({ href: '/play/ranked', label: 'Matchmaking', icon: 'ranked' })
    expect(links.find(l => l.label === 'History')).toEqual({ href: '/stats/history', label: 'History', icon: 'history' })
    for (const link of sideLinks(all).filter(l => l.label !== 'Progress')) expect(labels(links)).toContain(link.label)
    for (const gone of ['Progress', 'Friends', 'Boards']) expect(labels(links)).not.toContain(gone)
  })

  it('leaves out what a flag or the role hides: Matchmaking without matchmaking, Stats without its Overview', () => {
    expect(names()).toEqual([
      ['Play', ['Play', 'Tournaments']],
      ['You', ['History']],
      ['Account', ['Settings']],
    ])
    expect(
      menuSections()
        .flatMap(s => s.links)
        .find(l => l.label === 'Tournaments'),
    ).toMatchObject({ disabled: true, soon: true })
  })

  it('marks one item current: the most specific route', () => {
    const hrefs = menuSections({ home: true, ranked: true, stats: true }).flatMap(s => s.links.map(l => l.href))
    expect(mostSpecific('/play', hrefs)).toBe('/play')
    expect(mostSpecific('/play/ranked', hrefs)).toBe('/play/ranked')
    expect(mostSpecific('/play/ranked/ranks', hrefs)).toBe('/play/ranked')
    expect(mostSpecific('/play/missions', hrefs)).toBe('/play')
    expect(mostSpecific('/stats', hrefs)).toBe('/stats')
    expect(mostSpecific('/stats/history/g1', hrefs)).toBe('/stats/history')
    expect(mostSpecific('/', hrefs)).toBe('/')
    expect(mostSpecific('/friends', hrefs)).toBeUndefined()
  })

  it('adds Invites, in Social, while some are pending', () => {
    expect(names({ invites: 2 })).toContainEqual(['Social', ['Invites']])
    expect(
      menuSections({ invites: 2 })
        .flatMap(s => s.links)
        .find(l => l.label === 'Invites'),
    ).toMatchObject({
      href: '/invites',
      badge: 2,
      badgeLabel: '2 pending',
    })
    expect(
      menuSections()
        .flatMap(s => s.links)
        .map(l => l.label),
    ).not.toContain('Invites')
  })
})
