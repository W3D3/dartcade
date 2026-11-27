// The mission builder's form (Mission-Builder artboards, Missions part 3): the mission being edited
// with a key per step, the choices the artboard offers, the presets, and the checks. The checks are
// the shared MissionSchema's, so the builder and the server agree on every limit; its issues become
// field errors keyed by path ("steps.1.within").
import { api } from '$lib/api'
import { deviceStore } from '$lib/storage'
import { z } from 'zod'
import {
  DIFFICULTIES,
  MissionSchema,
  StepSchema,
  VISIBILITIES,
  type Mission,
  type Step,
  type StepOf,
  type StepType,
  type Target,
} from '$shared/missions/types'
import { fmtClock, type MissionCard, type MissionVisibility } from './view'

export type DraftStep = { key: string; step: Step }

/** The time limit's choices: none, a preset in seconds, or minutes and seconds of the player's own. */
export const LIMIT_PRESETS = [300, 600, 900, 1800] as const
export type LimitChoice = 'none' | (typeof LIMIT_PRESETS)[number] | 'custom'

export type BuilderForm = Omit<Mission, 'steps' | 'timeLimit'> & {
  steps: DraftStep[]
  limit: LimitChoice
  customMinutes: number
  customSeconds: number
  visibility: MissionVisibility
  /** An official mission ("by Dartcade"): set by an admin, always everyone's. */
  official: boolean
}

let nextKey = 0
export const stepKey = (): string => `step-${nextKey++}`
export const keyed = (step: Step): DraftStep => ({ key: stepKey(), step })

export function newForm(): BuilderForm {
  return {
    name: '',
    description: '',
    difficulty: 'medium',
    order: 'any',
    onFail: 'retry',
    pause: false,
    rankBy: 'time',
    steps: [],
    limit: 'none',
    customMinutes: 10,
    customSeconds: 0,
    visibility: 'friends',
    official: false,
  }
}

export function fromMission(m: Mission, visibility: MissionVisibility, official: boolean): BuilderForm {
  const { steps, timeLimit, ...rest } = m
  const preset = LIMIT_PRESETS.find(p => p === timeLimit)
  return {
    ...rest,
    steps: steps.map(keyed),
    limit: timeLimit === undefined ? 'none' : (preset ?? 'custom'),
    customMinutes: timeLimit === undefined ? 10 : Math.floor(timeLimit / 60),
    customSeconds: timeLimit === undefined ? 0 : timeLimit % 60,
    visibility,
    official,
  }
}

export function timeLimitOf(form: Pick<BuilderForm, 'limit' | 'customMinutes' | 'customSeconds'>): number | undefined {
  if (form.limit === 'none') return undefined
  return form.limit === 'custom' ? form.customMinutes * 60 + form.customSeconds : form.limit
}

/** The mission the form describes, as the API takes it (not checked yet). */
export function toMission(form: BuilderForm): Mission {
  const timeLimit = timeLimitOf(form)
  return {
    name: form.name,
    description: form.description,
    difficulty: form.difficulty,
    order: form.order,
    ...(timeLimit === undefined ? {} : { timeLimit }),
    onFail: form.onFail,
    pause: form.pause,
    rankBy: form.rankBy,
    steps: form.steps.map(s => s.step),
  }
}

// ── Steps ─────────────────────────────────────────────────────────────────

/** The Add a step sheet's tiles. */
export const STEP_TYPES: readonly { type: StepType; label: string; line: string }[] = [
  { type: 'checkout', label: 'Checkout', line: 'Finish a score within N darts' },
  { type: 'hit', label: 'Hit targets', line: 'One or more targets: count, streak, order, darts or one visit' },
  { type: 'marks', label: 'Marks', line: 'Collect marks on targets (double = 2, treble = 3)' },
  { type: 'visits', label: 'Visits', line: 'Every visit above/below a score, N visits' },
  { type: 'score', label: 'Score', line: 'Score X+ within N darts' },
  { type: 'average', label: 'Average', line: 'Keep a 3-dart average over N visits' },
  { type: 'leg', label: 'Fast leg', line: 'Win a 501 leg within N darts' },
]
export const typeLabel = (t: StepType): string => STEP_TYPES.find(s => s.type === t)?.label ?? t

/** A new step of a type, as the artboard fills it in. */
export function newStep(type: StepType): Step {
  switch (type) {
    case 'checkout':
      return { type, start: 121, maxDarts: 9, finish: 'double' }
    case 'hit':
      return { type, targets: ['S20', 'D20', 'T20'], hits: 1, inARow: false, order: 'any', within: 'visit' }
    case 'marks':
      return { type, targets: [20], marks: 5, per: 'each', within: 4 }
    case 'visits':
      return { type, compare: 'at_least', points: 41, visits: 5, inARow: true }
    case 'score':
      return { type, points: 300, within: 9 }
    case 'average':
      return { type, average: 60, visits: 10 }
    case 'leg':
      return { type, start: 501, within: 18, finish: 'double' }
  }
}

const ring = (r: 'S' | 'D' | 'T'): Target[] => Array.from({ length: 20 }, (_, i) => `${r}${i + 1}`)

export type Preset<K extends StepType> = { label: string; step: StepOf<K> }
export const PRESETS: { hit: Preset<'hit'>[]; marks: Preset<'marks'>[]; visits: Preset<'visits'>[] } = {
  hit: [
    { label: 'Shanghai 20', step: { type: 'hit', targets: ['S20', 'D20', 'T20'], hits: 1, inARow: false, order: 'any', within: 'visit' } },
    { label: 'Bull ×5', step: { type: 'hit', targets: ['B'], hits: 5, inARow: false, order: 'any' } },
    { label: 'Every double once', step: { type: 'hit', targets: ring('D'), hits: 1, inARow: false, order: 'any' } },
    {
      label: 'Around the board 1–20 + Bull',
      step: { type: 'hit', targets: [...Array.from({ length: 20 }, (_, i) => `${i + 1}`), 'B'], hits: 1, inARow: false, order: 'in_order' },
    },
    { label: 'Treble 20 streak', step: { type: 'hit', targets: ['T20'], hits: 3, inARow: true, order: 'any' } },
  ],
  marks: [
    { label: '5 marks on 20 in 4 darts', step: { type: 'marks', targets: [20], marks: 5, per: 'each', within: 4 } },
    { label: 'Close 15–20 + Bull', step: { type: 'marks', targets: [15, 16, 17, 18, 19, 20, 25], marks: 3, per: 'each' } },
    { label: '9 marks in one visit', step: { type: 'marks', targets: [20], marks: 9, per: 'total', within: 3 } },
  ],
  visits: [
    { label: '41+ for 5 visits', step: { type: 'visits', compare: 'at_least', points: 41, visits: 5, inARow: true } },
    { label: '60+ for 10 visits', step: { type: 'visits', compare: 'at_least', points: 60, visits: 10, inARow: true } },
    { label: '100+ three times', step: { type: 'visits', compare: 'at_least', points: 100, visits: 3, inARow: false } },
    { label: 'Never 26', step: { type: 'visits', compare: 'not', points: 26, visits: 10, inARow: true } },
  ],
}

/** Tap a target chip: single → double → treble → any segment → single; the bull: outer ↔ inner. */
export function cycleTarget(t: Target): Target {
  if (t === 'B') return 'DB'
  if (t === 'DB') return 'B'
  const n = t.replace(/^[SDT]/, '')
  const next: Record<string, string> = { S: 'D', D: 'T', T: '' }
  return /^\d/.test(t) ? `S${n}` : `${next[t[0]]}${n}`
}

/** The numbers Add target offers: 1–20, 25 the bull. */
export const BOARD_NUMBERS: readonly number[] = [...Array.from({ length: 20 }, (_, i) => i + 1), 25]
export const numberLabel = (n: number): string => (n === 25 ? 'Bull' : String(n))
/** A hit step's new target: the single of a number, or the bull. */
export const hitTarget = (n: number): Target => (n === 25 ? 'B' : `S${n}`)

/** Moves the step `key` before `beforeKey` (null: to the end). */
export function moveStep(steps: DraftStep[], key: string, beforeKey: string | null): DraftStep[] {
  const moving = steps.find(s => s.key === key)
  if (!moving || key === beforeKey) return steps
  const rest = steps.filter(s => s.key !== key)
  const at = beforeKey === null ? rest.length : rest.findIndex(s => s.key === beforeKey)
  return at < 0 ? steps : [...rest.slice(0, at), moving, ...rest.slice(at)]
}

/** Moves the step `key` one place up (-1) or down (1); at an end it stays. */
export function shiftStep(steps: DraftStep[], key: string, by: -1 | 1): DraftStep[] {
  const i = steps.findIndex(s => s.key === key)
  const j = i + by
  if (i < 0 || j < 0 || j >= steps.length) return steps
  const out = [...steps]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

export function duplicateStep(steps: DraftStep[], key: string): DraftStep[] {
  const i = steps.findIndex(s => s.key === key)
  // Shallow is enough: the editors replace a step's target lists, never change them in place
  return i < 0 ? steps : [...steps.slice(0, i + 1), keyed({ ...steps[i].step }), ...steps.slice(i + 1)]
}

// ── Checks ────────────────────────────────────────────────────────────────

/** Field errors by path ("name", "steps.1.within", "timeLimit"); the first problem of each field. */
export type FieldErrors = Map<string, string>

type Issue = {
  code: string
  path: PropertyKey[]
  message: string
  expected?: unknown
  minimum?: unknown
  maximum?: unknown
  origin?: string
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function issueText(i: Issue): string {
  switch (i.code) {
    case 'invalid_type':
      return i.expected === 'int' ? 'Enter a whole number' : 'Enter a number'
    case 'too_small':
      return i.origin === 'array' ? (i.path.at(-1) === 'steps' ? 'Add a step' : 'Add a target') : `At least ${String(i.minimum)}`
    case 'too_big':
      return `At most ${String(i.maximum)}`
    default:
      return sentence(i.message)
  }
}

function fieldErrors(r: { success: true } | { success: false; error: { issues: Issue[] } }): FieldErrors {
  const out: FieldErrors = new Map()
  for (const i of r.success ? [] : r.error.issues) {
    const key = i.path.join('.')
    if (!out.has(key)) out.set(key, issueText(i))
  }
  return out
}

/** What is wrong with the form, as the server would say it. */
export const formErrors = (form: BuilderForm): FieldErrors => fieldErrors(MissionSchema.safeParse(toMission(form)))

/** What is wrong with one step (a new one, before it is added), by its field. */
export const newStepErrors = (step: Step): FieldErrors => fieldErrors(StepSchema.safeParse(step))

/** The errors of one step (`steps.<i>.`), by its field. */
export function stepErrors(errors: FieldErrors, i: number): FieldErrors {
  const prefix = `steps.${i}.`
  return new Map([...errors].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]))
}

/** Each step as the checks pass it, null for one they refuse: titles, the suggestion and the estimate go by these. */
export function checkedSteps(form: BuilderForm, errors: FieldErrors): (Step | null)[] {
  return form.steps.map((s, i) => (stepErrors(errors, i).size === 0 && !errors.has(`steps.${i}`) ? s.step : null))
}

/** A whole number from a number input; NaN while it is empty, which the checks then name. */
export const numberValue = (e: Event & { currentTarget: HTMLInputElement }): number =>
  e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber

/** What a number input shows: nothing for NaN. */
export const shown = (n: number | undefined): string => (n === undefined || Number.isNaN(n) ? '' : String(n))

// ── Words ─────────────────────────────────────────────────────────────────

export const ORDER_HELP: Record<Mission['order'], string> = {
  any: 'Players can switch steps at any time.',
  in_order: 'Each step unlocks when the one before is done.',
}
export const ON_FAIL_HELP: Record<Mission['onFail'], string> = {
  retry: 'Finished steps stay done; only the failed step starts over.',
  restart: 'Any failed step resets all steps. The clock keeps running.',
}
export const VISIBILITY_HELP: Record<MissionVisibility, string> = {
  private: 'Only you see it. Good for drafts and private practice.',
  friends: 'Friends see it under Play › Missions and can try to beat your best time.',
  public: 'Anyone can find it. Everyone sees the best times.',
}

const targetsText = (targets: Target[]) => targets.map(t => (t === 'B' ? 'Bull' : t === 'DB' ? 'Inner bull' : t)).join(', ')

/** The line under a step's fields. */
export function stepHelp(step: Step): string | null {
  switch (step.type) {
    case 'checkout':
      return `If the darts run out or you bust, this attempt fails and the score resets to ${shown(step.start) || 'the start'}.`
    case 'hit': {
      const notes = [
        step.inARow ? `In a row: any dart that misses ${targetsText(step.targets)} resets the count to 0.` : null,
        !step.inARow && step.order === 'in_order' && step.targets.length > 1
          ? 'A wrong dart in between doesn’t reset, but every dart counts toward the limit.'
          : null,
        step.targets.includes('B') ? 'Bull = outer or inner bull.' : null,
        step.targets.some(t => t.startsWith('S')) ? 'Inner or outer single both count.' : null,
      ].filter(n => n !== null)
      return notes.length > 0
        ? notes.join(' ')
        : 'Example: Shanghai = S20, D20 and T20 in one visit, any order. One target with a count = a hit streak; several targets in order = a sequence or around the board.'
    }
    case 'marks':
      return 'Single = 1 mark, double = 2, treble = 3. Outer bull = 1, inner bull = 2. Example: 5 marks on 20 in 4 darts.'
    case 'visits': {
      const miss = { at_least: 'below', at_most: 'above', exactly: 'other than', not: 'of' }[step.compare]
      return `A visit is 3 darts; a bust counts as 0.${step.inARow ? ` In a row: one visit ${miss} ${shown(step.points)} resets the count.` : ''}`
    }
    default:
      return null
  }
}

/** The preview's To complete: "Finish all 3 steps in any order", the time limit, and the fail rule. */
export function toComplete(m: Pick<Mission, 'steps' | 'order' | 'timeLimit' | 'onFail'>): {
  lead: string
  time: string | null
  tail: string
} {
  const n = m.steps.length
  return {
    lead: n === 1 ? 'Finish the step' : `Finish all ${n} steps${m.order === 'any' ? ' in any order' : ' in order'}`,
    time: m.timeLimit === undefined || Number.isNaN(m.timeLimit) ? null : fmtClock(m.timeLimit * 1000),
    tail: m.onFail === 'retry' ? 'A failed step can be retried on its own.' : 'A failed step resets everything.',
  }
}

// ── Saving ────────────────────────────────────────────────────────────────

/** Compared to tell whether the form has changes nobody saved. */
export function formSnapshot(form: BuilderForm): string {
  const { name, description, difficulty, order, onFail, pause, rankBy, steps, limit, customMinutes, customSeconds, visibility, official } =
    form
  const fields = [name, description, difficulty, order, onFail, pause, rankBy, limit, customMinutes, customSeconds, visibility, official]
  return JSON.stringify([...fields, steps.map(s => s.step)])
}

/** A draft as this device keeps it; every field may be missing (an older draft). */
const DraftSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    difficulty: z.enum(DIFFICULTIES),
    order: z.enum(['any', 'in_order']),
    onFail: z.enum(['retry', 'restart']),
    pause: z.boolean(),
    rankBy: z.enum(['time', 'darts']),
    steps: z.array(z.unknown()),
    limit: z.literal(['none', 'custom', ...LIMIT_PRESETS]),
    customMinutes: z.number(),
    customSeconds: z.number(),
    visibility: z.enum(VISIBILITIES),
    official: z.boolean(),
  })
  .partial()

/** Which builder a kept draft belongs to: the mission being edited, else a new one (a copy of `from`, or blank). */
export type DraftOf = { id: string | null; from: string | null }

// Each its own key, so a blank new mission and a copy never pick up each other's draft
const draftKey = ({ id, from }: DraftOf) => `mission-draft:${id ?? (from ? `new:${from}` : 'new')}`

export function storeDraft(of: DraftOf, form: BuilderForm): void {
  try {
    deviceStore()?.setItem(draftKey(of), JSON.stringify({ ...form, steps: form.steps.map(s => s.step) }))
  } catch {
    // Not kept (storage full or blocked): only a reload loses it
  }
}

export function clearDraft(of: DraftOf): void {
  try {
    deviceStore()?.removeItem(draftKey(of))
  } catch {
    // Nothing to clear
  }
}

/** A kept draft, if it still reads as one (else it is dropped). */
export function readDraft(of: DraftOf): BuilderForm | null {
  let raw: string | null | undefined
  try {
    raw = deviceStore()?.getItem(draftKey(of))
  } catch {
    return null
  }
  if (!raw) return null
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const r = DraftSchema.safeParse(json)
  if (!r.success) return null
  // A step that doesn't pass the checks (a field left empty) isn't kept
  const steps = (r.data.steps ?? []).flatMap(s => {
    const step = StepSchema.safeParse(s)
    return step.success ? [keyed(step.data)] : []
  })
  return { ...newForm(), ...r.data, steps }
}

export type SaveResult = { ok: MissionCard } | { error: string; fields: FieldErrors }

const SERVER_PATH = /^body\/mission\/?/

/**
 * Creates the mission (an official one for an admin who ticked it) or saves the one being edited;
 * `wasOfficial` is how the edited mission started, and only a change of it sends `official` (admins only).
 */
export async function saveMission(form: BuilderForm, id: string | null, wasOfficial = false): Promise<SaveResult> {
  const mission = toMission(form)
  const res = id
    ? await api.PUT('/api/missions/{id}', {
        params: { path: { id } },
        body: { mission, visibility: form.visibility, ...(form.official !== wasOfficial && { official: form.official }) },
      })
    : await api.POST('/api/missions', { body: { mission, visibility: form.visibility, ...(form.official && { official: true }) } })
  if (res.data) return { ok: res.data }
  const status = res.response.status
  if (status === 409) {
    const error =
      res.error.error === 'hidden'
        ? 'A moderator hid this mission. It has to be restored before it can be made official.'
        : 'You have made as many missions as one player can. Delete one to make another.'
    return { error, fields: new Map() }
  }
  const details = res.error.details ?? []
  const fields: FieldErrors = new Map(
    details.filter(d => SERVER_PATH.test(d.path)).map(d => [d.path.replace(SERVER_PATH, '').replaceAll('/', '.'), sentence(d.message)]),
  )
  return { error: status === 400 ? 'Some fields need a look.' : "Couldn't save the mission. Try again in a moment.", fields }
}

/** Loads a mission to edit or copy; null if it isn't there (or the user may not see it). */
export async function loadCard(id: string): Promise<MissionCard | null> {
  return (await api.GET('/api/missions/{id}', { params: { path: { id } } })).data ?? null
}

/** Starts a test run of a saved mission: the new game's id. */
export async function startTestRun(id: string): Promise<{ ok: string } | { error: string }> {
  const res = await api.POST('/api/missions/{id}/start', { params: { path: { id } }, body: { test: true, force: false } })
  return res.data ? { ok: res.data.sessionId } : { error: res.error.error }
}
