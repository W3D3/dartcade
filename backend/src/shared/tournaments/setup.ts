// What a tournament may be set up as (TournamentInput in schema/api-v1.yaml): pure rules, so the
// create page can show the same problems. The game's own options are checked by its module on the
// server.
import { CONTROL_CHARS } from '../names.js'
import type { AvgLimit } from './avgLimit.js'

export type TournamentAccess = 'public' | 'friends' | 'invite' | 'in_person'
export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'groups_knockout'

export interface TournamentSettings {
  readonly seeding: 'rating' | 'random' | 'manual'
  readonly firstTo: number
  readonly longerFinal: { readonly firstTo: number; readonly semis: boolean } | null
  readonly groups: { readonly size: number; readonly through: number } | null
  readonly registrationClosesMinutes: number | null
  readonly checkInMinutes: number | null
  readonly plannedFor: string | null
  readonly manualScoring: boolean
  readonly noShowMinutes: number | null
  readonly avgLimit: AvgLimit | null
}

export interface TournamentSetup {
  readonly name: string
  readonly description: string
  readonly access: TournamentAccess
  readonly format: TournamentFormat
  readonly maxEntries: number
  readonly startsAt: string | null
  readonly settings: TournamentSettings
}

export interface Problem {
  readonly path: string
  readonly message: string
}

export const TOURNAMENT_TEXT = { nameMin: 3, nameMax: 40, descriptionMax: 280 } as const
/** Tournaments an owner may have that are not finished or cancelled. */
export const MAX_UNFINISHED_TOURNAMENTS = 5
/** Co-organizers a tournament may have besides its owner. */
export const MAX_ORGANIZERS = 10
/** Everyone plays everyone: 16 entries are already 120 matches. */
export const ROUND_ROBIN_MAX_ENTRIES = 16
/** Check-in windows: before a fixed start, or after an organizer presses Start. */
const CHECK_IN_BEFORE = [15, 30, 60]
const CHECK_IN_AFTER = [2, 5, 10]

/** The setup's problems that do not depend on the time, each with its body path. */
export function setupProblems(t: TournamentSetup): Problem[] {
  const out: Problem[] = []
  const bad = (path: string, message: string) => out.push({ path: `body/${path}`, message })
  const s = t.settings
  const online = t.access !== 'in_person'

  const nameLength = Array.from(t.name).length
  if (nameLength < TOURNAMENT_TEXT.nameMin || nameLength > TOURNAMENT_TEXT.nameMax)
    bad('name', `must be ${TOURNAMENT_TEXT.nameMin}-${TOURNAMENT_TEXT.nameMax} characters`)
  if (Array.from(t.description).length > TOURNAMENT_TEXT.descriptionMax)
    bad('description', `must be at most ${TOURNAMENT_TEXT.descriptionMax} characters`)
  for (const field of ['name', 'description'] as const) if (CONTROL_CHARS.test(t[field])) bad(field, 'must not contain control characters')

  if (t.format === 'groups_knockout' && !s.groups) bad('settings/groups', 'groups + knockout needs a group size')
  if (t.format !== 'groups_knockout' && s.groups) bad('settings/groups', 'only groups + knockout has groups')
  if (t.format === 'round_robin' && t.maxEntries > ROUND_ROBIN_MAX_ENTRIES)
    bad('maxEntries', `a round robin has at most ${ROUND_ROBIN_MAX_ENTRIES} entries`)
  if (s.longerFinal && t.format === 'round_robin') bad('settings/longerFinal', 'a round robin has no final')
  if (s.longerFinal && s.longerFinal.firstTo <= s.firstTo) bad('settings/longerFinal', 'the final must be longer than a match')

  if (t.startsAt === null) {
    if (t.access === 'public') bad('startsAt', 'a public tournament needs a start time')
    if (s.registrationClosesMinutes !== null) bad('settings/registrationClosesMinutes', 'only for a fixed start time')
    if (online && !CHECK_IN_AFTER.includes(s.checkInMinutes ?? -1))
      bad('settings/checkInMinutes', `after the start an organizer presses, check-in is ${CHECK_IN_AFTER.join(', ')} minutes`)
  } else {
    if (!online) bad('startsAt', 'an organizer starts an in-person tournament')
    if (s.plannedFor !== null) bad('settings/plannedFor', 'only when an organizer starts it')
    if (s.registrationClosesMinutes === null) bad('settings/registrationClosesMinutes', 'a fixed start needs a registration close')
    if (s.checkInMinutes !== null && !CHECK_IN_BEFORE.includes(s.checkInMinutes))
      bad('settings/checkInMinutes', `before a fixed start, check-in is none or ${CHECK_IN_BEFORE.join(', ')} minutes`)
    // Registration happens while the tournament is open, so check-in may open only once it has closed
    else if (s.checkInMinutes !== null && s.registrationClosesMinutes !== null && s.checkInMinutes > s.registrationClosesMinutes)
      bad('settings/checkInMinutes', 'check-in opens once registration has closed')
  }
  if (!online && s.checkInMinutes !== null) bad('settings/checkInMinutes', 'an in-person tournament has no check-in')
  if (!online && s.noShowMinutes !== null) bad('settings/noShowMinutes', 'an in-person tournament has no no-show wait')
  if (s.avgLimit) {
    const { min, max } = s.avgLimit
    if (!online) bad('settings/avgLimit', 'an in-person tournament has no average limit')
    if (min === null && max === null) bad('settings/avgLimit', 'needs a minimum, a maximum or both')
    if (min !== null && max !== null && min >= max) bad('settings/avgLimit', 'the minimum must be below the maximum')
  }
  return out
}

/** Whether registration would still be open at `now`: checked when the start changes or on publish. */
export function startProblems(t: TournamentSetup, now: Date): Problem[] {
  if (t.startsAt === null) return []
  const closes = Date.parse(t.startsAt) - (t.settings.registrationClosesMinutes ?? 0) * 60_000
  return closes > now.getTime() ? [] : [{ path: 'body/startsAt', message: 'registration would already be closed' }]
}

/** Settings an organizer may still change once someone has registered, with startsAt and description. */
const EDITABLE_WHEN_LOCKED: ReadonlySet<string> = new Set([
  'startsAt',
  'description',
  'settings.registrationClosesMinutes',
  'settings.checkInMinutes',
  'settings.plannedFor',
])

/** The fields (`settings.*` for a setting) that differ between two setups, besides the ones a lock leaves editable. */
export function lockedChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const flat = (o: Record<string, unknown>) =>
    Object.entries(o).flatMap(([k, v]) =>
      k === 'settings' && v && typeof v === 'object'
        ? Object.entries(v).map(([sk, sv]) => [`settings.${sk}`, sv] as const)
        : [[k, v] as const],
    )
  // Key order is not a change (the game's options and a setting's object are flat)
  const key = (v: unknown) => JSON.stringify(v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort()) : v)
  const was = new Map(flat(before).map(([k, v]) => [k, key(v)]))
  return flat(after)
    .filter(([k, v]) => !EDITABLE_WHEN_LOCKED.has(k) && was.get(k) !== key(v))
    .map(([k]) => k)
}
