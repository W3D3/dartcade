// An in-person tournament's participants as the organizers edit them (Tournament-Create's
// Participants, the Edit team dialog, Tournament-Onsite): a draft the form keeps, typed, pasted or
// imported, saved as one list. The rules are the server's (`$shared/tournaments/participants`).
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { plural } from '$lib/fmt'
import { hrefs } from '$lib/routes'
import { FORMAT_LONG, gameLine } from './browse'
import type { Tournament } from './create'
import { TEAM_COLORS, type TeamColor } from '$shared/teams'
import { cleanEntries, participantProblems, startBlocker, type EntryInput } from '$shared/tournaments/participants'

export type Participants = components['schemas']['TournamentParticipants']
export type ParticipantsBody = components['schemas']['TournamentParticipantsInput']

export interface DraftSpot {
  /** Stable for the list's keyed rows; a stored spot's id otherwise a new one. */
  key: string
  id?: string
  name: string
  claimCode?: string
  claimedBy?: { id: string; name: string } | null
}

export interface DraftEntry {
  key: string
  id?: string
  name: string
  tag: string
  color: TeamColor
  players: DraftSpot[]
}

/** Solo players and teams are kept apart, so switching Entry back and forth loses neither. */
export interface ParticipantsDraft {
  solo: DraftEntry[]
  teams: DraftEntry[]
}

/** The most players or teams an in-person tournament takes (its size, not shown in person). */
export const IN_PERSON_MAX = 64

let nextKey = 0
const key = () => `new-${++nextKey}`

export const emptyDraft = (): ParticipantsDraft => ({ solo: [], teams: [] })

/** "Treble Trouble" → "TT"; one word gives its first three letters. */
export function autoTag(name: string): string {
  const words = name.toUpperCase().match(/\p{L}+/gu) ?? []
  const tag = words.length > 1 ? words.map(w => w[0]).join('') : (words[0] ?? '')
  const letters = tag.replace(/[^A-Z]/g, '').slice(0, words.length > 1 ? 4 : 3)
  return letters.length >= 2 ? letters : 'TM'
}

export const spot = (name = ''): DraftSpot => ({ key: key(), name })

export const soloEntry = (name: string): DraftEntry => ({ key: key(), name, tag: '', color: TEAM_COLORS[0], players: [spot(name)] })

/** A new team after `count` others: "Team 3", the next colour. */
export function newTeam(count: number, name = `Team ${count + 1}`, players: string[] = []): DraftEntry {
  return { key: key(), name, tag: autoTag(name), color: TEAM_COLORS[count % TEAM_COLORS.length], players: players.map(p => spot(p)) }
}

/** The stored participants as a draft of the tournament's entry kind. */
export function fromParticipants(p: Participants, teamSize: number): ParticipantsDraft {
  const entries: DraftEntry[] = p.entries.map((e, i) => ({
    key: e.id,
    id: e.id,
    name: e.name,
    tag: e.tag ?? autoTag(e.name),
    color: e.color ?? TEAM_COLORS[i % TEAM_COLORS.length],
    players: e.players.map(s => ({ key: s.id, ...s })),
  }))
  return teamSize === 1 ? { solo: entries, teams: [] } : { solo: [], teams: entries }
}

export const isClaimed = (s: DraftSpot): boolean => !!s.claimedBy

/** The pill a spot shows: claimed by an account, a named guest, or an open spot. */
export const spotState = (s: DraftSpot | undefined): 'claimed' | 'guest' | 'empty' =>
  s && isClaimed(s) ? 'claimed' : s?.name.trim() ? 'guest' : 'empty'

/** The players a team keeps with `perTeam` players; the rest are removed on save. */
export const kept = (e: DraftEntry, perTeam: number): DraftSpot[] => e.players.filter(p => p.name.trim()).slice(0, perTeam)

/** Players that a smaller team size would remove, with their team. */
export function overflow(teams: readonly DraftEntry[], perTeam: number): { team: string; player: string }[] {
  return teams.flatMap(t =>
    t.players
      .filter(p => p.name.trim())
      .slice(perTeam)
      .map(p => ({ team: t.name, player: p.name })),
  )
}

/** The fewest players per team that removes nobody. */
export const fullestTeam = (teams: readonly DraftEntry[]): number =>
  Math.max(0, ...teams.map(t => t.players.filter(p => p.name.trim()).length))

/** The list as the API takes it: blank names left out, teams cut to their size. */
export function toBody(d: ParticipantsDraft, perTeam: number): ParticipantsBody {
  if (perTeam === 1)
    return {
      entries: d.solo
        .filter(e => e.players[0]?.name.trim())
        .map(e => ({
          id: e.id,
          name: e.players[0].name,
          tag: null,
          color: null,
          players: [{ id: e.players[0].id, name: e.players[0].name }],
        })),
    }
  return {
    entries: d.teams.map(t => ({
      id: t.id,
      name: t.name,
      tag: t.tag.trim() || null,
      color: t.color,
      players: kept(t, perTeam).map(p => ({ id: p.id, name: p.name })),
    })),
  }
}

const asEntries = (body: ParticipantsBody, perTeam: number): EntryInput[] => cleanEntries(body.entries, perTeam)

/** What the server would refuse, as one line each. */
export function draftProblems(d: ParticipantsDraft, perTeam: number, max: number): string[] {
  const problems = participantProblems(asEntries(toBody(d, perTeam), perTeam), { teamSize: perTeam, maxEntries: max })
  return [...new Set(problems.map(p => `Participants: ${p.message}`))]
}

/** Why it couldn't start with this list yet (the artboard's line), or null. */
export const draftBlocker = (d: ParticipantsDraft, perTeam: number): string | null =>
  startBlocker(asEntries(toBody(d, perTeam), perTeam), perTeam)

/** One pasted or imported line: a player, or a team and its players. */
export interface ParsedLine {
  name: string
  players: string[]
}

const HEADERS = new Set(['name', 'player', 'players', 'team'])

/**
 * One name per line; teams `Team; Player; Player`. Commas and tabs separate too, so a CSV export
 * reads the same; surrounding quotes go, and a header row ("Name", "Team") is skipped.
 */
export function parseList(text: string, teams: boolean): ParsedLine[] {
  // shortcut: no quoted separators inside a field; use papaparse if names with commas show up
  const rows = text
    .split(/\r?\n/)
    .map(line =>
      line
        .split(/[;,\t]/)
        .map(f =>
          f
            .trim()
            .replace(/^"(.*)"$/, '$1')
            .trim(),
        )
        .filter(Boolean),
    )
    .filter(fields => fields.length > 0)
  if (rows.length > 0 && HEADERS.has(rows[0][0].toLowerCase())) rows.shift()
  return rows.map(([name, ...players]) => (teams ? { name, players } : { name, players: [name] }))
}

export interface AddResult {
  draft: ParticipantsDraft
  added: number
  /** Names already on the list (or twice in the paste). */
  duplicates: number
  /** Lines or players past the tournament's size or a team's size. */
  overCap: number
}

/** Adds parsed lines to the draft, leaving out duplicate names (ignoring case) and what doesn't fit. */
export function addParsed(d: ParticipantsDraft, lines: readonly ParsedLine[], perTeam: number, max = IN_PERSON_MAX): AddResult {
  const teams = perTeam > 1
  const list = teams ? d.teams : d.solo
  const lower = (s: string) => s.toLocaleLowerCase()
  const names = new Set(list.flatMap(e => e.players.map(p => lower(p.name.trim()))).filter(Boolean))
  const teamNames = new Set(d.teams.map(t => lower(t.name)))
  const added: DraftEntry[] = []
  let duplicates = 0
  let overCap = 0
  for (const line of lines) {
    if (list.length + added.length >= max) {
      overCap++
      continue
    }
    const players: string[] = []
    for (const p of line.players) {
      if (names.has(lower(p))) duplicates++
      else players.push(p)
      names.add(lower(p))
    }
    if (!teams) {
      if (players.length > 0) added.push(soloEntry(players[0]))
      continue
    }
    if (teamNames.has(lower(line.name))) {
      duplicates++
      continue
    }
    teamNames.add(lower(line.name))
    overCap += Math.max(0, players.length - perTeam)
    added.push(newTeam(d.teams.length + added.length, line.name, players.slice(0, perTeam)))
  }
  return {
    draft: teams ? { ...d, teams: [...d.teams, ...added] } : { ...d, solo: [...d.solo, ...added] },
    added: added.length,
    duplicates,
    overCap,
  }
}

/** "Added 6. 2 were already on the list." */
export function addedLine(r: Omit<AddResult, 'draft'>, perTeam: number): string {
  const what = (n: number) => (perTeam > 1 ? `${n} ${n === 1 ? 'team' : 'teams'}` : `${n} ${n === 1 ? 'player' : 'players'}`)
  const parts = [`Added ${what(r.added)}.`]
  if (r.duplicates > 0) parts.push(`${r.duplicates} ${r.duplicates === 1 ? 'name was' : 'names were'} already on the list.`)
  if (r.overCap > 0) parts.push(`${r.overCap} didn’t fit.`)
  return parts.join(' ')
}

/** A spot's claim link, to send or show at the venue. */
export const claimUrl = (code: string): string => `${location.origin}/${hrefs.tournamentClaim(code)}`

/** Every spot's claim link, one "Name: link" per line, for Copy all claim links. */
export function allClaimLinks(p: Participants, teams: boolean): string {
  return p.entries
    .flatMap(e => e.players.filter(s => !s.claimedBy).map(s => `${teams ? `${e.name} · ` : ''}${s.name}: ${claimUrl(s.claimCode)}`))
    .join('\n')
}

export async function loadParticipants(id: string): Promise<Participants | null> {
  return (await api.GET('/api/tournaments/{id}/participants', { params: { path: { id } } })).data ?? null
}

/** What the server's 409s about the list mean. */
export const PARTICIPANTS_REFUSED: Partial<Record<string, string>> = {
  claimed: 'A claimed player can’t be renamed. Unlink them first.',
  started: 'The tournament has started, so the players can’t change anymore.',
}

/** Saves the whole list; the stored list, or the reasons it was refused. */
export async function saveParticipants(
  id: string,
  body: ParticipantsBody,
): Promise<{ ok: true; participants: Participants } | { ok: false; errors: string[] }> {
  const res = await api.PUT('/api/tournaments/{id}/participants', { params: { path: { id } }, body })
  if (res.data) return { ok: true, participants: res.data }
  const refused = PARTICIPANTS_REFUSED[res.error.error]
  if (refused) return { ok: false, errors: [refused] }
  const details = res.error.details ?? []
  return {
    ok: false,
    errors: details.length > 0 ? details.map(d => `Participants: ${d.message}`) : ['Couldn’t save the players. Try again.'],
  }
}

export async function unlinkSpot(id: string, playerId: string): Promise<Participants | null> {
  return (await api.POST('/api/tournaments/{id}/participants/{playerId}/unlink', { params: { path: { id, playerId } } })).data ?? null
}

/** Gives an unclaimed spot a new claim link; the old one stops working. */
export async function reissueSpot(id: string, playerId: string): Promise<Participants | null> {
  return (await api.POST('/api/tournaments/{id}/participants/{playerId}/reissue', { params: { path: { id, playerId } } })).data ?? null
}

/** The organizer page's line under the name: "X01 501 · double out · first to 3 · single elimination · 8 players". */
export function organizerLine(t: Tournament, entries: number): string {
  return [
    gameLine(t.gameId, t.gameConfig, t.settings.firstTo),
    FORMAT_LONG[t.format].toLowerCase(),
    plural(entries, t.teamSize === 1 ? 'player' : 'team'),
  ].join(' · ')
}

/** "8 · 2 claimed" for players, "6 teams · 3 of 12 claimed" for teams. */
export function claimedLine(p: Participants, teams: boolean): string {
  const spots = p.entries.flatMap(e => e.players)
  const claimed = spots.filter(s => s.claimedBy).length
  return teams ? `${plural(p.entries.length, 'team')} · ${claimed} of ${spots.length} claimed` : `${spots.length} · ${claimed} claimed`
}
