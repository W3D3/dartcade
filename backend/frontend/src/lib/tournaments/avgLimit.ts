// The average limit (Tournament-Create's Average limit, Browse's tag and Not eligible): what the
// form edits, the limit it sends, and the words Browse shows. The rule is the server's
// (`$shared/tournaments/avgLimit`).
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { AVG_CLASS_MAX, AVG_CLASS_MIN } from '$shared/avgClass'
import { viewerEligibility, type AvgLimit, type Form } from '$shared/tournaments/avgLimit'
import type { Choice } from './create'

type Eligibility = NonNullable<components['schemas']['TournamentEligibility']>

export type AvgMode = 'between' | 'at_least' | 'at_most'

export interface AvgLimitForm {
  on: boolean
  mode: AvgMode
  min: number
  max: number
  teams: AvgLimit['teams']
  minLegs: number
  lock: boolean
}

export const DEFAULT_AVG_LIMIT: AvgLimitForm = { on: false, mode: 'between', min: 50, max: 70, teams: 'team', minLegs: 20, lock: true }

export const AVG_MODES: Choice<AvgMode>[] = [
  { value: 'between', label: 'Between' },
  { value: 'at_least', label: 'At least' },
  { value: 'at_most', label: 'At most' },
]
export const AVG_TEAMS: Choice<AvgLimit['teams']>[] = [
  { value: 'every', label: 'Every player' },
  { value: 'team', label: 'Team average' },
]

/** The scale under the bounds: Ø20+ to Ø100+, every ten. */
export const SCALE = Array.from({ length: (AVG_CLASS_MAX - AVG_CLASS_MIN) / 10 + 1 }, (_, i) => AVG_CLASS_MIN + i * 10)
/** Where an average sits on the scale, in percent (clamped to its ends). */
export const scalePercent = (avg: number): number =>
  Math.min(100, Math.max(0, ((avg - AVG_CLASS_MIN) / (AVG_CLASS_MAX - AVG_CLASS_MIN)) * 100))

/** What the form sends: only the bounds its mode uses; null when off or in person. */
export function toAvgLimit(f: AvgLimitForm, online: boolean): AvgLimit | null {
  if (!f.on || !online) return null
  return {
    min: f.mode === 'at_most' ? null : f.min,
    max: f.mode === 'at_least' ? null : f.max,
    teams: f.teams,
    minLegs: f.minLegs,
    lock: f.lock,
  }
}

export function fromAvgLimit(l: AvgLimit | null): AvgLimitForm {
  if (l === null) return DEFAULT_AVG_LIMIT
  return {
    on: true,
    mode: l.min === null ? 'at_most' : l.max === null ? 'at_least' : 'between',
    min: l.min ?? DEFAULT_AVG_LIMIT.min,
    max: l.max ?? DEFAULT_AVG_LIMIT.max,
    teams: l.teams,
    minLegs: l.minLegs,
    lock: l.lock,
  }
}

const num = (n: number) => String(Math.round(n * 10) / 10)

/** The bounds: "50–70", "50+", "up to 45". */
export const avgRange = (l: AvgLimit): string =>
  l.min !== null && l.max !== null ? `${num(l.min)}–${num(l.max)}` : l.min !== null ? `${num(l.min)}+` : `up to ${num(l.max ?? 0)}`

/** Browse's tag: "Ø 50–70", "Ø 50+", "Ø up to 45", "Team Ø 55+". */
export const avgTag = (l: AvgLimit, teamSize: number): string => `${teamSize > 1 && l.teams === 'team' ? 'Team Ø' : 'Ø'} ${avgRange(l)}`

/** Why not, under Not eligible: "Your Ø 68.4 · max 45". */
export function notEligibleLine(e: Eligibility, l: AvgLimit): string {
  switch (e.reason) {
    case 'few_legs':
      return `Needs ${l.minLegs} legs in 30 days`
    case 'no_average':
      return 'No X01 average in 30 days'
    case 'below':
      return `Your Ø ${e.average?.toFixed(1)} · min ${num(l.min ?? 0)}`
    case 'above':
      return `Your Ø ${e.average?.toFixed(1)} · max ${num(l.max ?? 0)}`
    default:
      return ''
  }
}

/** Why the average limit took a spot at check-in (the tournament.dropped toast). */
export function droppedLine(reason: Eligibility['reason'], average: number | null): string {
  switch (reason) {
    case 'few_legs':
      return 'you played fewer X01 legs in the last 30 days than it needs'
    case 'below':
      return `your 30-day average (${average?.toFixed(1)}) is now below its minimum`
    case 'above':
      return `your 30-day average (${average?.toFixed(1)}) is now above its maximum`
    default:
      return 'you have no X01 average from the last 30 days'
  }
}

/** The create form's line about the organizer against the limit (the server's rule); null while it loads. */
export function fitsLine(l: AvgLimit, teamSize: number, me: Form | null): { text: string; fits: boolean } | null {
  if (me === null) return null
  const e = viewerEligibility(l, teamSize, me)
  const avg = me.average?.toFixed(1)
  switch (e.reason) {
    case null:
      // A team average is judged on the picked players together: only the legs are yours alone
      return teamSize > 1 && l.teams === 'team'
        ? { text: `You played enough legs; your 30-day average (${avg ?? '–'}) counts towards your team’s`, fits: true }
        : { text: `Your 30-day average (${avg}) fits`, fits: true }
    case 'few_legs':
      return { text: `You played ${me.legs} X01 legs in the last 30 days; it needs ${l.minLegs}`, fits: false }
    case 'no_average':
      return { text: 'You have no X01 average from the last 30 days', fits: false }
    default:
      return { text: `Your 30-day average (${avg}) doesn’t fit`, fits: false }
  }
}

/** The caller's 30-day form; null if it could not be loaded. */
export async function loadForm(): Promise<Form | null> {
  try {
    return (await api.GET('/api/tournaments/form')).data ?? null
  } catch {
    return null
  }
}
