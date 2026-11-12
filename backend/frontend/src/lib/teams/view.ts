// What the Teams tab says about a team and its invites (Tournaments-Teams, Team-Create boards).
import type { Friend, TeamInvite, UserRef } from '$lib/api/lobby-ws'
import { calendarDaysAgo, dayMonth, ordinal, plural, weekday } from '$lib/fmt'
import { friendChips, friendMatches } from '$lib/lobby/friendChips'
import { fmtRp } from '$lib/ranked/view'
import { DAY_MS } from '$shared/time'
import type { Team } from './actions'

/** "expires in 6 days", "expires today". */
export function expiresIn(expiresAt: string, now: Date): string {
  const days = Math.floor((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS)
  return days < 1 ? 'expires today' : `expires in ${plural(days, 'day')}`
}

/** "Invited 2 days ago · expires in 5 days". */
export function invitedLine(invite: { createdAt: string; expiresAt: string }, now: Date): string {
  const ago = calendarDaysAgo(new Date(invite.createdAt), now)
  const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`
  return `Invited ${when} · ${expiresIn(invite.expiresAt, now)}`
}

/** The invite card's second line: "4 players · Sophie, Pia, Ben, Nico · invite expires in 6 days". */
export function inviteSummary(invite: TeamInvite, now: Date): string {
  const more = invite.memberCount - invite.members.length
  const names = invite.members.map(m => m.name).join(', ') + (more > 0 ? ` +${more}` : '')
  return `${plural(invite.memberCount, 'player')} · ${names} · invite ${expiresIn(invite.expiresAt, now)}`
}

/** Who sent it, or the team when the inviter's account is gone. */
export const inviterName = (invite: TeamInvite): string => invite.inviter?.name ?? 'The captain'

export const captainLine = (team: Team, myId: string): string =>
  team.captainUserId === myId ? 'You’re captain' : `Captain: ${team.members.find(m => m.user.id === team.captainUserId)?.user.name ?? '?'}`

/** "7–3" (won–lost). */
export const recordText = (team: Team): string => `${team.record.wins}–${team.record.losses}`

/** "64.8", or a dash before anyone played X01 in the last 30 days. */
export const averageText = (average: number | null): string => (average === null ? '–' : average.toFixed(1))

/** "1 284", or a dash before the placement matches. */
export const ratingText = (rating: number | null): string => (rating === null ? '–' : fmtRp(rating))

type TeamTournament = Team['tournaments'][number]

/** The result column: the place, else where the entry stands. */
export function tournamentResult(t: TeamTournament): { text: string; tone: 'gold' | 'silver' | 'pending' | 'dim' } {
  if (t.finalPlace !== null)
    return { text: ordinal(t.finalPlace), tone: t.finalPlace === 1 ? 'gold' : t.finalPlace <= 3 ? 'silver' : 'dim' }
  if (t.entryStatus === 'pending') return { text: 'Pending', tone: 'pending' }
  if (t.entryStatus === 'withdrawn') return { text: 'Withdrawn', tone: 'dim' }
  if (t.status === 'running') return { text: 'Playing', tone: 'silver' }
  if (t.status === 'finished' || t.status === 'cancelled') return { text: '–', tone: 'dim' }
  return { text: 'Registered', tone: 'silver' }
}

/** "Sat 15 Nov", or "Organizer starts it" without a start time. */
export const tournamentDate = (t: TeamTournament): string =>
  t.startsAt === null ? 'Organizer starts it' : `${weekday(new Date(t.startsAt))} ${dayMonth(new Date(t.startsAt))}`

/** The next tournament it plays in, for the Next tile. */
export const nextTournament = (team: Team): TeamTournament | null =>
  team.tournaments
    .filter(t => (t.status === 'open' || t.status === 'check_in' || t.status === 'running') && t.entryStatus !== 'withdrawn')
    .sort((a, b) => (a.startsAt ?? '￿').localeCompare(b.startsAt ?? '￿'))
    .at(0) ?? null

/** "best: 2nd", or nothing to say yet. */
export const bestPlaceText = (team: Team): string =>
  team.record.bestPlace === null ? 'no result yet' : `best: ${ordinal(team.record.bestPlace)}`

/** Places left (members and invites count). */
export const placesLeft = (team: Team, max: number): number => max - team.members.length - team.invites.length

export type PickerPerson = UserRef & { detail: string }

/**
 * Who the invite picker offers: your friends whose name starts with what's typed (with nothing
 * typed, your friends online first), then the account with exactly that name. Never anyone in
 * `exclude` (members, invited, picked).
 */
export function pickerPeople(
  friends: Friend[],
  exactMatch: { id: string; name: string }[],
  query: string,
  exclude: readonly string[],
  max = 5,
): PickerPerson[] {
  const shown =
    query === ''
      ? friendChips(friends, exclude, max).flatMap(c => friends.filter(f => f.id === c.id))
      : friendMatches(friends, query, exclude)
  const people: PickerPerson[] = shown.map(f => ({
    id: f.id,
    name: f.name,
    avatar: f.avatar,
    detail: f.status.kind === 'offline' ? 'Friend' : 'Friend · online',
  }))
  for (const u of exactMatch)
    if (!exclude.includes(u.id) && !people.some(p => p.id === u.id))
      people.push({ id: u.id, name: u.name, avatar: { kind: 'none' }, detail: 'Player' })
  return people.slice(0, max)
}
