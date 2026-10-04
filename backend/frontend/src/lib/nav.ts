import type { LobbySummary } from './api/lobby-ws'
import { indicatorView } from './lobby/format.js'

export type NavTab = { href: string; label: string; icon: 'play' | 'live' | 'boards' | 'history'; badge?: number }

/** The phone tab bar and the tablet rail: Live only while a game is running; pending invites as a badge on Play. */
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

/** The tablet rail's Lobby item: create one, your solo lobby, or the lobby you're in by name. */
export type RailLobby =
  | { kind: 'create'; label: string; aria: string }
  | { kind: 'solo' | 'in'; href: string; label: string; aria: string }

/** Null until we know who you are (`signedIn`: the per-user socket has spoken). */
export function railLobby(summary: LobbySummary | null, signedIn: boolean): RailLobby | null {
  if (!summary) return signedIn ? { kind: 'create', label: 'Lobby', aria: 'Create lobby' } : null
  if (summary.solo) return { kind: 'solo', href: '/lobby', label: 'Lobby', aria: 'Play with friends: open the lobby' }
  const view = indicatorView(summary)
  return { kind: 'in', href: '/lobby', label: view.name, aria: `You're in the lobby ${view.name}. ${view.line}. Open the lobby` }
}
