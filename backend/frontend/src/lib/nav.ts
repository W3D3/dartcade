import { hrefs } from './routes'
import type { LobbySummary } from './api/lobby-ws'
import type { FriendList } from './lobby/sockets'
import { indicatorView } from './lobby/format.js'

export type NavTab = {
  href: string
  label: string
  icon: 'home' | 'play' | 'ranked' | 'coach' | 'tournaments' | 'progress' | 'stats' | 'history' | 'settings' | 'admin' | 'invites'
  badge?: number
  /** What the badge counts, read out ('2 pending invites'). */
  badgeLabel?: string
  /** When the label alone doesn't say it. */
  aria?: string
  /** Shown dimmed, not a link: Tournaments while its flag is off. */
  disabled?: boolean
}

/** What the nav shows besides the fixed pages: counts for the badges and the features that are on. */
export type NavState = {
  /** Pending lobby invites, a badge on Play. */
  invites?: number
  /** Matchmaking: the phone menu's shortcut to Play's Ranked tab. */
  ranked?: boolean
  /** Challenges to claim while progression is on; null while it is off. */
  progress?: number | null
  /** Admins and moderators. */
  admin?: boolean
  home?: boolean
  coach?: boolean
  /** Stats' Overview tab: off, Stats opens on its History tab. */
  stats?: boolean
  tournaments?: boolean
}

/**
 * The phone tab bar and the tablet rail: Play (New game, Ranked and Missions are its tabs), Coach
 * while the coach is on, Progress while progression is on (Mobile-Progress), Tournaments while it
 * is on (Tournaments-Phone; dimmed "soon" in Progress's place while both are off), Stats (History
 * is its tab); pending invites as a badge on Play. There is no Live entry: a running game is one
 * tap away from Play's Continue and the lobby strip.
 */
export function navTabs({
  invites = 0,
  progress = null,
  home = false,
  coach = false,
  stats = false,
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
    ...(coach ? [{ href: '/coach', label: 'Coach', icon: 'coach' as const }] : []),
    ...(progress !== null ? [{ href: '/progress', label: 'Progress', icon: 'progress' as const, ...dailyBadge(progress) }] : []),
    // Progress took over the dimmed placeholder's slot; once on, Tournaments has a slot of its own
    ...(tournaments || progress === null ? [tournamentsLink(tournaments)] : []),
    statsLink(stats),
  ]
}

/** The tablet rail: the phone's tabs, then Settings and Admin (admins and moderators), which phones reach from the account menu. */
export function railTabs(nav: NavState = {}): NavTab[] {
  return [
    ...navTabs(nav),
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

/** Stats with History as its tab: the Overview while stats.enabled is on, else straight to History. */
function statsLink(on: boolean): NavTab {
  return { href: on ? '/stats' : '/stats/history', label: 'Stats', icon: 'stats' }
}

/** Progress counts the challenges finished and waiting to be claimed. */
function dailyBadge(toClaim: number): Pick<NavTab, 'badge' | 'badgeLabel'> {
  return toClaim > 0 ? { badge: toClaim, badgeLabel: `${toClaim} ${toClaim === 1 ? 'challenge' : 'challenges'} to claim` } : {}
}

/** The desktop side nav: the same pages under their long names (Coach while the coach is on, Tournaments dimmed "soon" while it is off), then Progress, Settings and Admin (admins and moderators). */
export function sideLinks({
  admin = false,
  progress = null,
  home = false,
  coach = false,
  stats = false,
  tournaments = false,
}: NavState = {}): SideLink[] {
  return [
    ...(home ? [{ href: '/', label: 'Home', icon: 'home' as const }] : []),
    { href: '/play', label: 'Play', icon: 'play' },
    ...(coach ? [{ href: '/coach', label: 'Coach', icon: 'coach' as const }] : []),
    tournamentsLink(tournaments),
    statsLink(stats),
    ...(progress !== null ? [{ href: '/progress', label: 'Progress', icon: 'progress' as const, ...dailyBadge(progress) }] : []),
    { href: '/settings', label: 'Settings', icon: 'settings' },
    ...(admin ? [{ href: '/admin', label: 'Admin', icon: 'admin' as const }] : []),
  ]
}

/** `label` is null for the ungrouped first entry (Home). */
export type MenuSection = { label: string | null; links: SideLink[] }

/** The phone menu's headings, each with the entries it holds in order. */
const MENU_SECTIONS: { label: string | null; icons: SideLink['icon'][] }[] = [
  { label: null, icons: ['home'] },
  { label: 'Play', icons: ['play', 'ranked', 'coach', 'tournaments'] },
  { label: 'You', icons: ['stats', 'history'] },
  { label: 'Social', icons: ['invites'] },
  { label: 'Account', icons: ['settings', 'admin'] },
]

/**
 * The phone's burger menu: the pages the desktop side nav lists (same flags, same badges) except
 * Progress, plus shortcuts to two tabs: Matchmaking (Play's Ranked tab, while matchmaking is on) and
 * History (Stats' History tab), with Stats itself only while its Overview is on. Invites while some
 * are pending. Home first with no heading, then four headings. Progress and Friends are in the account
 * menu, Boards in Settings. A heading with nothing under it is left out.
 */
export function menuSections(nav: NavState = {}): MenuSection[] {
  const invites = nav.invites ?? 0
  const links: SideLink[] = [
    ...sideLinks(nav).filter(l => l.icon !== 'stats' || nav.stats),
    ...(nav.ranked ? [{ href: '/play/ranked', label: 'Matchmaking', icon: 'ranked' as const }] : []),
    { href: '/stats/history', label: 'History', icon: 'history' },
    ...(invites > 0
      ? [{ href: '/invites', label: 'Invites', icon: 'invites' as const, badge: invites, badgeLabel: `${invites} pending` }]
      : []),
  ]
  return MENU_SECTIONS.map(({ label, icons }) => ({ label, links: icons.flatMap(icon => links.filter(l => l.icon === icon)) })).filter(
    s => s.links.length > 0,
  )
}

/** The route itself or a page under it (`/play/ranked/ranks` is still Play). */
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

/** A tab of a page with several (Play, Stats): its route, the link (which may carry a remembered query) and its name. */
export type PageTab = { path: string; href: string; label: string; icon: 'new-game' | 'ranked' | 'missions' | 'overview' | 'history' }

/** Play's tabs: New game, then Ranked while matchmaking is on and Missions while missions are. */
export function playTabs({ ranked = false, missions = false }: { ranked?: boolean; missions?: boolean } = {}): PageTab[] {
  return [
    { path: '/play', href: hrefs.play(), label: 'New game', icon: 'new-game' },
    ...(ranked ? [{ path: '/play/ranked', href: hrefs.ranked(), label: 'Ranked', icon: 'ranked' as const }] : []),
    ...(missions ? [{ path: '/play/missions', href: hrefs.missions(), label: 'Missions', icon: 'missions' as const }] : []),
  ]
}

/** Stats' tabs: Overview while stats.enabled is on, then History (`history`: its link, filter included, as last left). */
export function statsTabs(overview: boolean, history = hrefs.history()): PageTab[] {
  return [
    ...(overview ? [{ path: '/stats', href: hrefs.stats(), label: 'Overview', icon: 'overview' as const }] : []),
    { path: '/stats/history', href: history, label: 'History', icon: 'history' },
  ]
}

/** Of several routes, the one a location is on: the longest it is at or under (`/play/ranked/ranks` is `/play/ranked`, not `/play`). */
export function mostSpecific(location: string, routes: string[]): string | undefined {
  return routes.filter(r => isActiveRoute(location, r)).reduce<string | undefined>((a, r) => (a && a.length >= r.length ? a : r), undefined)
}

/** The tab a location is on. */
export function activeTab(location: string, tabs: PageTab[]): PageTab | undefined {
  const path = mostSpecific(
    location,
    tabs.map(t => t.path),
  )
  return tabs.find(t => t.path === path)
}
