// Every in-app link is built here, so a link is spelled once. `__tests__/routes.test.ts` checks each
// builder against the router table in App.svelte; add a builder there too. Each builder returns the
// hash href ("#/history/abc"); `query` is an already-encoded query string without its "?".
import type { Tab } from './progress/customise.js'
import type { SettingsSection } from './settings/sections.js'
import type { TournamentsTab } from './tournaments/tabs.js'

const at = (path: string, query?: string): string => `#${path}${query ? `?${query}` : ''}`

export const hrefs = {
  home: () => at('/'),
  play: (query?: string) => at('/play', query),
  session: (id: string) => at(`/session/${id}`),
  watch: (id: string) => at(`/watch/${id}`),
  login: (query?: string) => at('/login', query),
  register: () => at('/register'),
  verify: (query?: string) => at('/verify', query),
  forgot: () => at('/forgot'),
  reset: () => at('/reset'),
  /** The Terms, Privacy Policy and Imprint pages. */
  legal: (page: 'terms' | 'privacy' | 'imprint') => at(`/${page}`),
  history: (id?: string) => at(id ? `/history/${id}` : '/history'),
  stats: () => at('/stats'),
  coach: (query?: string) => at('/coach', query),
  coachChecks: () => at('/coach/checks'),
  coachLeg: (gameId: string, leg: string | number) => at(`/coach/leg/${gameId}/${leg}`),
  lobby: (query?: string) => at('/lobby', query),
  join: (code?: string, query?: string) => at(code ? `/join/${code}` : '/join', query),
  invites: () => at('/invites'),
  settings: (section?: SettingsSection, query?: string) => at(section ? `/settings/${section}` : '/settings', query),
  voicePack: (id: string) => at(`/voice-packs/${id}`),
  friends: () => at('/friends'),
  matchmaking: () => at('/matchmaking'),
  tournaments: (tab?: TournamentsTab) => at(tab ? `/tournaments/${tab}` : '/tournaments'),
  /** An invite link's landing: Browse with that tournament's Details open. */
  tournamentJoin: (code: string) => at(`/tournaments/join/${code}`),
  tournamentNew: () => at('/tournaments/new'),
  /** `saved`: say so above the form (after creating it, the page this one replaced). */
  tournamentEdit: (id: string, query?: string) => at(`/tournaments/${id}/edit`, query),
  ranks: () => at('/matchmaking/ranks'),
  progress: () => at('/progress'),
  rewards: (level?: number | string) => at(level === undefined ? '/progress/rewards' : `/progress/rewards/${level}`),
  achievements: () => at('/progress/achievements'),
  profile: (id?: string) => at(id ? `/profile/${id}` : '/profile'),
  customise: (tab?: Tab) => at(tab ? `/profile/customise/${tab}` : '/profile/customise'),
  bigScreen: (board: string) => at(`/big-screen/${board}`),
  bigScreenFrame: () => at('/big-screen-frame'),
  devStats: () => at('/dev/stats'),
  admin: () => at('/admin'),
  adminUsers: () => at('/admin/users'),
  adminGames: (id?: string) => at(id ? `/admin/games/${id}` : '/admin/games'),
  adminFlags: () => at('/admin/flags'),
  adminRanked: () => at('/admin/ranked'),
  adminSystem: () => at('/admin/system'),
  adminDartSamples: () => at('/admin/dart-samples'),
  adminCosmetics: () => at('/admin/cosmetics'),
  adminCoach: () => at('/admin/coach'),
  adminMinigolf: (query?: string) => at('/admin/minigolf', query),
  adminMinigolfReports: () => at('/admin/minigolf/reports'),
  adminMinigolfCourses: () => at('/admin/minigolf/courses'),
  minigolfBrowse: () => at('/minigolf/browse'),
  minigolfCourses: () => at('/minigolf/courses'),
} as const
