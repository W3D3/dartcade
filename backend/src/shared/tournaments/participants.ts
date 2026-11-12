// An in-person tournament's participants (Tournament-Create's Participants, Tournament-Onsite): the
// spots the organizers type, paste or import. Pure rules, so the API and the form say the same.
import { CONTROL_CHARS, normalizeName } from '../names.js'
import { cleanTeamName, cleanTeamTag, isTeamTag, teamNameProblem, type TeamColor } from '../teams.js'
import type { Problem } from './setup.js'

export const SPOT_NAME_MAX = 24

export interface SpotInput {
  /** A stored spot keeps its id (and its claim link); a new one has none. */
  readonly id?: string
  readonly name: string
}

/** A solo entry is one spot; a team names itself, with up to teamSize spots. */
export interface EntryInput {
  readonly id?: string
  readonly name: string
  readonly tag: string | null
  readonly color: TeamColor | null
  readonly players: readonly SpotInput[]
}

/** A spot's name as stored: trimmed, NFC, inner runs of spaces as one. */
export const cleanSpotName = (raw: string): string => normalizeName(raw).replace(/\s+/gu, ' ')

const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase()

/** The entries as the API stores them: names and tags cleaned, a solo entry named after its player. */
export function cleanEntries(entries: readonly EntryInput[], teamSize: number): EntryInput[] {
  return entries.map(e => {
    const players = e.players.map(p => ({ ...p, name: cleanSpotName(p.name) }))
    return teamSize === 1
      ? { ...e, name: players[0]?.name ?? '', tag: null, color: null, players }
      : { ...e, name: cleanTeamName(e.name), tag: e.tag === null ? null : cleanTeamTag(e.tag), players }
  })
}

/** What is wrong with a cleaned list, each with its body path. */
export function participantProblems(entries: readonly EntryInput[], t: { teamSize: number; maxEntries: number }): Problem[] {
  const out: Problem[] = []
  const bad = (path: string, message: string) => out.push({ path: `body/entries${path}`, message })
  const solo = t.teamSize === 1
  if (entries.length > t.maxEntries) bad('', `at most ${t.maxEntries} ${solo ? 'players' : 'teams'}`)
  const seen: string[] = []
  const teams: string[] = []
  const ids = new Set<string>()
  const once = (id: string | undefined, path: string) => {
    if (id === undefined) return
    if (ids.has(id)) bad(path, 'listed twice')
    ids.add(id)
  }
  entries.forEach((e, i) => {
    once(e.id, `/${i}`)
    if (solo && e.players.length !== 1) bad(`/${i}/players`, 'a solo entry is one player')
    if (!solo) {
      if (e.players.length > t.teamSize) bad(`/${i}/players`, `at most ${t.teamSize} players per team`)
      const problem = teamNameProblem(e.name)
      if (problem) bad(`/${i}/name`, problem)
      else if (teams.some(n => sameName(n, e.name))) bad(`/${i}/name`, 'two teams have this name')
      teams.push(e.name)
      if (e.tag !== null && !isTeamTag(e.tag)) bad(`/${i}/tag`, '2-4 letters')
    }
    e.players.forEach((p, j) => {
      const path = `/${i}/players/${j}`
      once(p.id, path)
      const length = Array.from(p.name).length
      if (length < 1 || length > SPOT_NAME_MAX) bad(`${path}/name`, `1 to ${SPOT_NAME_MAX} characters`)
      else if (CONTROL_CHARS.test(p.name)) bad(`${path}/name`, 'no control characters')
      else if (seen.some(n => sameName(n, p.name))) bad(`${path}/name`, 'two players have this name')
      seen.push(p.name)
    })
  })
  return out
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

/**
 * Why the tournament can't start with these entries yet, as the artboard says it, or null: too
 * few entries, or a team with empty spots.
 */
export function startBlocker(entries: readonly EntryInput[], teamSize: number): string | null {
  const solo = teamSize === 1
  if (entries.length < 2) return `Add at least 2 ${solo ? 'players' : 'teams'} before you can start.`
  if (solo) return null
  const short = entries.filter(e => e.players.length < teamSize)
  if (short.length === 0) return null
  if (short.length === 1) {
    const [e] = short
    return `${e.name || 'A team'} still needs a ${ordinal(e.players.length + 1)} player before you can start.`
  }
  const empty = short.reduce((n, e) => n + teamSize - e.players.length, 0)
  return `Every team needs ${teamSize} players before you can start. ${empty} spots are still empty.`
}
