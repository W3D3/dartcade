import { derived, type Readable } from 'svelte/store'
import type { Component } from 'svelte'
import {
  ChartColumn,
  Clock,
  GraduationCap,
  House,
  Mail,
  Monitor,
  Settings,
  ShieldCheck,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  UsersRound,
} from '@lucide/svelte'
import { currentUser } from './auth'
import { flag } from './flags'
import { friendsEntry, type NavState, type NavTab } from './nav'
import { me, pendingInvites } from './lobby/sockets'
import { progress } from './progress/store'

const matchmaking = flag('matchmaking.enabled')
const progression = flag('progression.enabled')
const home = flag('home.enabled', true)
const coach = flag('coach.enabled')
const tournaments = flag('tournaments.enabled')
const stats = flag('stats.enabled')

/** What every nav (tab bar, rail, side nav, phone menu) shows: the features that are on and the counts for the badges. Add a nav flag here, once. */
export const navState: Readable<NavState> = derived(
  [matchmaking, progression, home, coach, tournaments, stats, currentUser, me, progress],
  ([$matchmaking, $progression, $home, $coach, $tournaments, $stats, $currentUser, $me, $progress]) => ({
    invites: pendingInvites($me),
    friendRequests: friendsEntry($me?.friends ?? null).requests,
    ranked: $matchmaking,
    admin: $currentUser?.isModerator ?? false,
    progress: $progression ? ($progress?.challengesToClaim ?? 0) : null,
    home: $home,
    coach: $coach,
    tournaments: $tournaments,
    stats: $stats,
  }),
)

/** The icon of each nav entry, for every nav. */
export const NAV_ICONS: Record<NavTab['icon'], Component> = {
  home: House,
  play: Target,
  ranked: Swords,
  coach: GraduationCap,
  tournaments: Trophy,
  progress: TrendingUp,
  history: Clock,
  stats: ChartColumn,
  settings: Settings,
  admin: ShieldCheck,
  friends: UsersRound,
  invites: Mail,
  boards: Monitor,
}
