import type { LobbySummary } from './api/lobby-ws'
import type { FriendList } from './lobby/sockets'
import { indicatorView } from './lobby/format.js'

export type NavTab = {
  href: string
  label: string
  icon: 'home' | 'play' | 'ranked' | 'live' | 'coach' | 'tournaments' | 'progress' | 'history' | 'stats' | 'settings' | 'admin'
  badge?: number
  /** What the badge counts, read out ('2 pending invites'). */
  badgeLabel?: string
  /** When the label alone doesn't say it ('Ranked' is the Matchmaking page). */
  aria?: string
  /** Shown dimmed, not a link: Live with no running game, Tournaments while its flag is off. */
  disabled?: boolean
}

/** Live links to your running game; with none it keeps its place, dimmed. */
function liveItem(liveSessionId: string | null, label: string): NavTab {
  return liveSessionId
    ? { href: `/session/${liveSessionId}`, label, icon: 'live' }
    : { href: '/session', label, icon: 'live', aria: `${label}: no game running`, disabled: true }
}

/** What the nav shows besides the fixed pages: counts for the badges and the features that are on. */
export type NavState = {
  /** Pending lobby invites, a badge on Play. */
  invites?: number
  ranked?: boolean
  /** Challenges to claim while progression is on; null while it is off. */
  progress?: number | null
  /** Admins and moderators. */
  admin?: boolean
  home?: boolean
  coach?: boolean
  stats?: boolean
  tournaments?: boolean
}

/**
 * The phone tab bar and the tablet rail: Play, Ranked while matchmaking is on (MM-Phone), Coach
 * while the coach is on, Progress while progression is on (Mobile-Progress), Tournaments while it
 * is on (Tournaments-Phone; dimmed "soon" in Progress's place while both are off), History;
 * pending invites as a badge on Play. No Live tab: a running game is one tap away from
 * Play's Continue and the lobby strip.
 */
export function navTabs({
  invites = 0,
  ranked = false,
  progress = null,
  home = false,
  coach = false,
  tournaments = false,
}: NavState = {}): NavTab[] {
  return [
    ...(home ? [{ href: '/', label: 'Home', icon: 'home' as const }] : []),
    {
      href: '/play',
      label: 'Play',
      icon: 'play',
      ...(invites > 0 ? { badge: invites, badgeLabel: `${invites} pending ${invites === 1 ? 'invite' : 'invites'}` } : {}),
    },
    ...(ranked ? [{ href: '/matchmaking', label: 'Ranked', icon: 'ranked' as const, aria: 'Matchmaking' }] : []),
    ...(coach ? [{ href: '/coach', label: 'Coach', icon: 'coach' as const }] : []),
    ...(progress !== null ? [{ href: '/progress', label: 'Progress', icon: 'progress' as const, ...dailyBadge(progress) }] : []),
    // Progress took over the dimmed placeholder's slot; once on, Tournaments has a slot of its own
    ...(tournaments || progress === null ? [tournamentsLink(tournaments)] : []),
    { href: '/history', label: 'History', icon: 'history' },
  ]
}

/** The tablet rail: the phone's tabs, then Stats (while it is on), Settings and Admin (admins and moderators), which phones reach from the account menu. */
export function railTabs(nav: NavState = {}): NavTab[] {
  return [
    ...navTabs(nav),
    ...(nav.stats ? [{ href: '/stats', label: 'Stats', icon: 'stats' as const }] : []),
    { href: '/settings', label: 'Settings', icon: 'settings' },
    ...(nav.admin ? [{ href: '/admin', label: 'Admin', icon: 'admin' as const }] : []),
  ]
}

export type SideLink = Omit<NavTab, 'aria'> & { soon?: boolean }

/** Tournaments: a link while its flag is on, else dimmed as coming soon. */
function tournamentsLink(on: boolean): NavTab & Pick<SideLink, 'soon'> {
  const link = { href: '/tournaments', label: 'Tournaments', icon: 'tournaments' } as const
  return on ? link : { ...link, aria: 'Tournaments: coming soon', disabled: true, soon: true }
}

/** Progress counts the challenges finished and waiting to be claimed. */
function dailyBadge(toClaim: number): Pick<NavTab, 'badge' | 'badgeLabel'> {
  return toClaim > 0 ? { badge: toClaim, badgeLabel: `${toClaim} ${toClaim === 1 ? 'challenge' : 'challenges'} to claim` } : {}
}

/** The desktop side nav: the same pages under their long names (Coach while the coach is on, Tournaments dimmed "soon" while it is off), then Stats (while it is on), Progress, Settings and Admin (admins and moderators). */
export function sideLinks(
  liveSessionId: string | null,
  { ranked = false, admin = false, progress = null, home = false, coach = false, stats = false, tournaments = false }: NavState = {},
): SideLink[] {
  const { href, disabled } = liveItem(liveSessionId, 'Live match')
  return [
    ...(home ? [{ href: '/', label: 'Home', icon: 'home' as const }] : []),
    { href: '/play', label: 'Play', icon: 'play' },
    ...(ranked ? [{ href: '/matchmaking', label: 'Matchmaking', icon: 'ranked' as const }] : []),
    ...(coach ? [{ href: '/coach', label: 'Coach', icon: 'coach' as const }] : []),
    { href, label: 'Live match', icon: 'live', ...(disabled ? { disabled } : {}) },
    tournamentsLink(tournaments),
    { href: '/history', label: 'History', icon: 'history' },
    ...(stats ? [{ href: '/stats', label: 'Stats', icon: 'stats' as const }] : []),
    ...(progress !== null ? [{ href: '/progress', label: 'Progress', icon: 'progress' as const, ...dailyBadge(progress) }] : []),
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
