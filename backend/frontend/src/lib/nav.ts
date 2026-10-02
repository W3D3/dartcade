export type NavTab = { href: string; label: string; icon: 'play' | 'live' | 'boards' | 'history' }

/** The phone tab bar: Live only while a game is running. */
export function navTabs(liveSessionId: string | null): NavTab[] {
  return [
    { href: '/', label: 'Play', icon: 'play' },
    ...(liveSessionId ? [{ href: `/session/${liveSessionId}`, label: 'Live', icon: 'live' as const }] : []),
    { href: '/boards', label: 'Boards', icon: 'boards' },
    { href: '/history', label: 'History', icon: 'history' },
  ]
}

export function isActiveRoute(location: string, href: string): boolean {
  return location === href || (location === '' && href === '/')
}
