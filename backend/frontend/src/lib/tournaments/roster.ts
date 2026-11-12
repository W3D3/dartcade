// A team's entry (Tournament-Register-Team, Tournament-Confirm-Phone, the waiting card on Teams):
// the Who plays? rows, the lines about who still has to confirm, and the requests behind Register a
// team, I'm in / Can't make it, Change player and Remind. The picks' rule is the server's
// (`$shared/tournaments/roster`).
import { api, type Tournament } from '$lib/api'
import type { components } from '$lib/api/schema'
import { LOCALE, joinNames } from '$lib/fmt'
import { entryEligibility } from '$shared/tournaments/avgLimit'
import { pickProblem, waitingFor, type Candidate } from '$shared/tournaments/roster'
import { avgRange } from './avgLimit'
import { outcome, refusal, type Outcome } from './browse'

export type TeamOption = components['schemas']['TournamentTeamOptions']['teams'][number]
export type TeamEntry = NonNullable<components['schemas']['TournamentTeamEntry']>
type Member = TeamOption['members'][number]
type Rules = Pick<Tournament, 'teamSize' | 'settings'>

const avg = (m: Member) => (m.form.average === null ? '–' : m.form.average.toFixed(1))
const candidate = (m: Member): Candidate => ({ userId: m.user.id, form: m.form, hasBoard: m.board !== null, taken: m.taken })
const byId = (team: TeamOption, ids: readonly string[]) => ids.flatMap(id => team.members.filter(m => m.user.id === id))

/** One member in Who plays?: picked or not, may it be toggled, and the line under the name. */
export interface PickRow {
  member: Member
  picked: boolean
  captain: boolean
  disabled: boolean
  detail: string
}

/** Who plays? for `team`, with `picked` ticked; `myId` is the caller (only a captain picks). */
export function pickRows(t: Rules, team: TeamOption, picked: readonly string[], myId: string): PickRow[] {
  const mine = team.captainId === myId
  const limit = t.settings.avgLimit
  const pickedMembers = byId(team, picked)
  return team.members.map(member => {
    const on = picked.includes(member.user.id)
    const captain = member.user.id === team.captainId
    const parts = [...(member.user.id === myId ? ['You'] : []), `30-day avg ${avg(member)}`]
    const noBoard = !t.settings.manualScoring && member.board === null
    if (!mine) {
      if (captain) parts.push('captain', 'only the captain can register this team')
    } else if (member.taken) parts.push('already in this tournament')
    else if (noBoard) parts.push('no paired board')
    else if (on && member.user.id === myId && member.board !== null) parts.push(`board: ${member.board}`)
    else if (on) parts.push('will get a request to confirm')
    else if (limit !== null && pickedMembers.length === t.teamSize - 1) {
      // Would picking them break the limit? Said before the captain tries
      const e = entryEligibility(
        limit,
        [...pickedMembers, member].map(m => m.form),
      )
      if (!e.eligible)
        parts.push(
          limit.teams === 'team' && e.average !== null
            ? `with ${member.user.name} the team average is ${e.average.toFixed(1)}, needs ${avgRange(limit)}`
            : `outside the limit (${avgRange(limit)})`,
        )
    }
    const full = !on && picked.length >= t.teamSize
    return { member, picked: on, captain, disabled: !mine || member.taken || noBoard || full, detail: parts.join(' · ') }
  })
}

/** The line beside Who plays?: "Team average: 64.8 · needs 55+" with 64.8 marked; null without a limit. */
export function limitLine(
  t: Rules,
  team: TeamOption,
  picked: readonly string[],
): { lead: string; value: string; tail: string; fits: boolean } | null {
  const limit = t.settings.avgLimit
  if (limit === null) return null
  if (limit.teams === 'every') return { lead: 'Every player needs ', value: avgRange(limit), tail: '', fits: true }
  const { eligibility } = pickProblem(t, byId(team, picked).map(candidate))
  const mean = eligibility?.average
  return {
    lead: 'Team average: ',
    value: mean == null ? '–' : mean.toFixed(1),
    tail: ` · needs ${avgRange(limit)}`,
    fits: eligibility?.eligible ?? true,
  }
}

/** Whether Send may be pressed, and why not. */
export function sendProblem(t: Rules, team: TeamOption, picked: readonly string[], myId: string): string | null {
  if (team.captainId !== myId) return 'Only the captain can register this team'
  if (team.entered) return 'This team is in already'
  const { problem } = pickProblem(t, byId(team, picked).map(candidate))
  switch (problem) {
    case 'count':
      return `Pick ${t.teamSize}`
    case 'taken':
      return 'Someone you picked already plays in this tournament'
    case 'not_eligible':
      return 'Outside the average limit'
    case 'board_needed':
      return 'Everyone needs a paired board'
    default:
      return null
  }
}

/** "Sat 18:00". */
export const shortWhen = (iso: string): string => {
  const d = new Date(iso)
  return `${d.toLocaleDateString(LOCALE, { weekday: 'short' })} ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`
}

/** "registration closes Sat 18:00", or an organizer starts it. */
const closing = (confirmBy: string | null) =>
  confirmBy === null ? 'an organizer starts the tournament' : `registration closes ${shortWhen(confirmBy)}`

/** The players other than the captain who get a request. */
export const toAsk = (team: TeamOption, picked: readonly string[], myId: string): string[] =>
  byId(team, picked)
    .filter(m => m.user.id !== myId)
    .map(m => m.user.name)

/** The Send button: "Send request to Lena", "Send requests to Lena and Max". */
export const sendLabel = (asked: readonly string[]): string =>
  asked.length === 0 ? 'Register team' : `Send ${asked.length === 1 ? 'request' : 'requests'} to ${joinNames(asked)}`

/** The note under Who plays?. */
export const holdNote = (asked: readonly string[], confirmBy: string | null): string =>
  `${asked.length === 0 ? 'Your teammates get' : `${joinNames(asked)} ${asked.length === 1 ? 'gets' : 'get'}`} a request to confirm. Your team’s spot is held until everyone has confirmed, or until ${closing(confirmBy)}. If someone declines you can pick another teammate.`

/** Who still has to confirm, by name. */
export const waitingNames = (e: TeamEntry): string[] => waitingFor(e.slots).flatMap(s => (s.user === null ? [] : [s.user.name]))

/** Places left empty by a decline. */
export const openPlaces = (e: TeamEntry): number => e.slots.filter(s => s.user === null).length

/** A captain's view of a team still to complete: the card title and the line under it; null once complete. */
export function waitingCard(e: TeamEntry, tournamentName: string): { title: string; detail: string } | null {
  if (e.status !== 'pending') return null
  const waiting = waitingNames(e)
  const team = e.team?.name ?? 'your team'
  if (openPlaces(e) > 0)
    return {
      title: `Pick a player for ${tournamentName}`,
      detail: `Someone can’t make it · ${team} keeps its spot until ${closing(e.confirmBy)}`,
    }
  return {
    title: `Waiting on ${joinNames(waiting)} for ${tournamentName}`,
    detail: `You registered ${team} with ${joinNames(waiting)} · they have until ${e.confirmBy === null ? 'the start' : shortWhen(e.confirmBy)} to confirm`,
  }
}

/** The row's status for the caller's team: "1 to confirm", "Waiting for Lena to confirm", "Confirm your place". */
export function teamStatus(e: TeamEntry, myId: string): { short: string; long: string; mine: boolean } | null {
  if (e.status !== 'pending') return null
  const me = e.slots.find(s => s.user?.id === myId)
  if (me && !me.confirmed) return { short: 'Confirm', long: 'Confirm your place', mine: true }
  const left = waitingNames(e).length + openPlaces(e)
  const long = openPlaces(e) > 0 ? 'Pick another player' : `Waiting for ${joinNames(waitingNames(e))} to confirm`
  return { short: `${left} to confirm`, long, mine: false }
}

/** Your teams for Register a team; null when they could not be loaded. */
export async function loadTeamOptions(id: string): Promise<TeamOption[] | null> {
  try {
    return (await api.GET('/api/tournaments/{id}/team-options', { params: { path: { id } } })).data?.teams ?? null
  } catch {
    return null
  }
}

/** `code`: the invite link it was opened by, which an invite link's tournament needs. */
export const registerTeam = (id: string, teamId: string, players: string[], code?: string): Promise<Outcome> =>
  outcome(api.POST('/api/tournaments/{id}/teams', { params: { path: { id }, query: { code } }, body: { teamId, players } }))

export const changePlayer = (id: string, position: number, userId: string): Promise<Outcome> =>
  outcome(api.PUT('/api/tournaments/{id}/roster/{position}', { params: { path: { id, position } }, body: { userId } }))

/** Resolves with what to say when refused, null when done. */
async function done(call: Promise<{ error?: { error: string }; response: Response }>): Promise<string | null> {
  try {
    const res = await call
    return res.response.ok ? null : refusal(res.error?.error)
  } catch {
    return refusal(undefined)
  }
}

/** I'm in (`accept`), or Can't make it. */
export const answerRequest = (id: string, accept: boolean) =>
  done(api.POST('/api/tournaments/{id}/roster/answer', { params: { path: { id } }, body: { accept } }))

export const remindPlayers = (id: string) => done(api.POST('/api/tournaments/{id}/roster/remind', { params: { path: { id } } }))
