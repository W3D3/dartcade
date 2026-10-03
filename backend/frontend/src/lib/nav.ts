export type NavTab = { href: string; label: string; icon: 'play' | 'live' | 'boards' | 'history'; badge?: number }

/** The phone tab bar: Live only while a game is running; pending invites as a badge on Play. */
export function navTabs(liveSessionId: string | null, invites = 0): NavTab[] {
  return [
    { href: '/', label: 'Play', icon: 'play', ...(invites > 0 ? { badge: invites } : {}) },
    ...(liveSessionId ? [{ href: `/session/${liveSessionId}`, label: 'Live', icon: 'live' as const }] : []),
    { href: '/boards', label: 'Boards', icon: 'boards' },
    { href: '/history', label: 'History', icon: 'history' },
  ]
}

export function isActiveRoute(location: string, href: string): boolean {
  return location === href || (location === '' && href === '/')
}
