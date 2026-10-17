import type { LobbySummary } from './api/lobby-ws'
import type { FriendList } from './lobby/sockets'
import { indicatorView } from './lobby/format.js'

export type NavTab = {
  href: string
  label: string
  icon: 'play' | 'ranked' | 'live' | 'tournaments' | 'history'
  badge?: number
  /** When the label alone doesn't say it ('Ranked' is the Matchmaking page). */
  aria?: string
  /** Shown dimmed, not a link: Live with no running game, Tournaments until it ships. */
  disabled?: boolean
}

/** Live links to your running game; with none it keeps its place, dimmed. */
function liveItem(liveSessionId: string | null, label: string): NavTab {
  return liveSessionId
    ? { href: `/session/${liveSessionId}`, label, icon: 'live' }
    : { href: '/session', label, icon: 'live', aria: `${label}: no game running`, disabled: true }
}

/**
 * The phone tab bar and the tablet rail: Play, Ranked while matchmaking is on (MM-Phone), Live,
 * Tournaments (soon), History; pending invites as a badge on Play.
 */
export function navTabs(liveSessionId: string | null, invites = 0, ranked = false): NavTab[] {
  return [
    { href: '/', label: 'Play', icon: 'play', ...(invites > 0 ? { badge: invites } : {}) },
    ...(ranked ? [{ href: '/matchmaking', label: 'Ranked', icon: 'ranked' as const, aria: 'Matchmaking' }] : []),
    liveItem(liveSessionId, 'Live'),
    { href: '/tournaments', label: 'Tournaments', icon: 'tournaments', aria: 'Tournaments: coming soon', disabled: true },
    { href: '/history', label: 'History', icon: 'history' },
  ]
}

export type SideLink = Omit<NavTab, 'icon' | 'badge' | 'aria'> & { icon: NavTab['icon'] | 'settings' | 'admin'; soon?: boolean }

/** The desktop side nav: the same pages under their long names, then Settings, then Admin (admins only). */
export function sideLinks(liveSessionId: string | null, ranked = false, admin = false): SideLink[] {
  const { href, disabled } = liveItem(liveSessionId, 'Live match')
  return [
    { href: '/', label: 'Play', icon: 'play' },
    ...(ranked ? [{ href: '/matchmaking', label: 'Matchmaking', icon: 'ranked' as const }] : []),
    { href, label: 'Live match', icon: 'live', ...(disabled ? { disabled } : {}) },
    { href: '/tournaments', label: 'Tournaments', icon: 'tournaments', disabled: true, soon: true },
    { href: '/history', label: 'History', icon: 'history' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
    ...(admin ? [{ href: '/admin', label: 'Admin', icon: 'admin' as const }] : []),
  ]
}

/** The route itself or a page under it (`/matchmaking/ranks` is still Matchmaking). */
export function isActiveRoute(location: string, href: string): boolean {
  if (href === '/') return location === '/' || location === ''
  return location === href || location.startsWith(`${href}/`)
}

/** The tablet rail's Lobby item: create one, or the lobby you're in with its head count ("Lobby · 6"). */
export type RailLobby = { kind: 'create'; label: string; aria: string } | { kind: 'in'; href: string; label: string; aria: string }

/** Null until we know who you are (`signedIn`: the per-user socket has spoken). */
export function railLobby(summary: LobbySummary | null, signedIn: boolean): RailLobby | null {
  if (!summary) return signedIn ? { kind: 'create', label: 'Lobby', aria: 'Create lobby' } : null
  const view = indicatorView(summary)
  return {
    kind: 'in',
    href: '/lobby',
    label: `Lobby · ${summary.peopleCount}`,
    aria: `You're in the lobby ${view.name}. ${view.line}. Open the lobby`,
  }
}

/** The Friends entry's badge (requests for you) and its label (friends online too). */
export function friendsEntry(list: FriendList | null): { requests: number; online: number; aria: string } {
  const requests = list?.incoming.length ?? 0
  const online = list?.friends.filter(f => f.status.kind !== 'offline').length ?? 0
  return { requests, online, aria: `Friends: ${online} online, ${requests} friend ${requests === 1 ? 'request' : 'requests'}` }
}
