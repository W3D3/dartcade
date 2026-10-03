import { describe, it, expect } from 'vitest'
import { navTabs, isActiveRoute } from '../nav.js'

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
