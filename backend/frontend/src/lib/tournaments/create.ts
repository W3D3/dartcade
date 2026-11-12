// The create/edit tournament form (Tournament-Create): what the organizer picks, how it becomes a
// TournamentInput (schema/api-v1.yaml), the preview card's text, and why an option is disabled.
// The rules themselves are the server's (`$shared/tournaments/setup`).
import { api } from '$lib/api'
import type { components } from '$lib/api/schema'
import { dayMonth, pad2, weekday } from '$lib/fmt'
import {
  ROUND_ROBIN_MAX_ENTRIES,
  setupProblems,
  startProblems,
  type TournamentAccess,
  type TournamentFormat,
} from '$shared/tournaments/setup'

export type TournamentInput = components['schemas']['TournamentInput']
export type Tournament = components['schemas']['Tournament']

/** Disabled options say why (a tooltip on a segment, a line under a card). */
export interface Choice<T> {
  value: T
  label: string
  disabled?: string
}

export interface CreateForm {
  name: string
  description: string
  access: TournamentAccess
  gameId: 'x01' | 'cricket'
  startScore: 301 | 501 | 701
  outMode: 'double' | 'straight' | 'master'
  cricketMode: 'standard' | 'cutthroat'
  firstTo: number
  longerFinal: boolean
  finalFirstTo: FinalFirstTo
  finalSemis: boolean
  entry: 'solo' | 'teams'
  playersPerTeam: 2 | 3 | 4
  format: TournamentFormat
  maxEntries: 8 | 16 | 32 | 64
  seeding: 'rating' | 'random' | 'manual'
  groupSize: 3 | 4 | 5
  through: 1 | 2
  startMode: 'fixed' | 'organizer'
  /** A datetime-local value (local time, no zone). */
  startsAt: string
  registrationCloses: 15 | 60 | 180 | 1440
  checkInBefore: 15 | 30 | 60 | null
  /** A datetime-local value ('' none): an organizer start's hint, or in person the day (its time unused). */
  plannedFor: string
  checkInAfter: 2 | 5 | 10
  manualScoring: boolean
  noShow: boolean
  noShowMinutes: 5 | 10 | 15
}

const nums = <T extends number>(values: readonly T[], unit = ''): Choice<T>[] => values.map(value => ({ value, label: `${value}${unit}` }))

export const START_SCORES = nums([301, 501, 701] as const)
export const OUT_MODES: Choice<CreateForm['outMode']>[] = [
  { value: 'double', label: 'Double out' },
  { value: 'straight', label: 'Single out' },
  { value: 'master', label: 'Master out' },
]
export const CRICKET_MODES: Choice<CreateForm['cricketMode']>[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'cutthroat', label: 'Cut-throat' },
]
export const FIRST_TO = nums([1, 2, 3, 4, 5, 6, 7])
export const PLAYERS_PER_TEAM = nums([2, 3, 4] as const)
export const SEEDING: Choice<CreateForm['seeding']>[] = [
  { value: 'rating', label: 'By rating' },
  { value: 'random', label: 'Random' },
  { value: 'manual', label: 'Manual' },
]
const SIZES = nums([8, 16, 32, 64] as const)
export const GROUP_SIZES = nums([3, 4, 5] as const)
export const THROUGH = nums([1, 2] as const)
export const CHECK_IN_AFTER = nums([2, 5, 10] as const, ' min')
export const NO_SHOW_WAIT = nums([5, 10, 15] as const, ' min')

export const ENTRY: (Choice<CreateForm['entry']> & { sub: string })[] = [
  { value: 'solo', label: 'Solo', sub: 'Every player for themselves' },
  { value: 'teams', label: 'Teams', sub: 'Two or more players per team' },
]

export const ACCESS: Choice<TournamentAccess>[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends' },
  { value: 'invite', label: 'Invite link' },
  { value: 'in_person', label: 'Added by you' },
]
export const ACCESS_HELP: Record<TournamentAccess, string> = {
  public: 'Anyone can find it in Browse and register.',
  friends: 'Only your friends see it and can register.',
  invite: 'Hidden from Browse. Only people with the link can register.',
  in_person:
    'Played at one place, on devices logged in to your account. Nobody registers: you add the players or teams, and they can claim their spot with a link.',
}

const LATER = 'Coming later: tournaments play X01 or Cricket for now.'
export const GAMES: (Choice<CreateForm['gameId'] | 'atc' | 'minigolf'> & { sub: string })[] = [
  { value: 'x01', label: 'X01', sub: '301 / 501 / 701' },
  { value: 'cricket', label: 'Cricket', sub: 'Standard or cut-throat' },
  { value: 'atc', label: 'Around the Clock', sub: '1–20, optional bull', disabled: LATER },
  { value: 'minigolf', label: 'Minigolf', sub: 'Pick a course', disabled: LATER },
]

export const FORMATS: (Choice<TournamentFormat> & { sub: string; short: string })[] = [
  { value: 'single_elimination', label: 'Single elimination', short: 'Single elim.', sub: 'Lose once and you’re out' },
  { value: 'double_elimination', label: 'Double elimination', short: 'Double elim.', sub: 'Second chance in the lower bracket' },
  { value: 'round_robin', label: 'Round robin', short: 'Round robin', sub: 'Everyone plays everyone' },
  { value: 'groups_knockout', label: 'Groups + knockout', short: 'Groups + knockout', sub: 'Groups play round robin, then a bracket' },
]

export const TEAM_PLAY: Choice<'alternate' | 'singles_doubles'>[] = [
  { value: 'alternate', label: 'Alternate visits' },
  { value: 'singles_doubles', label: 'Singles + doubles', disabled: 'Coming later: for now, teams play alternate visits.' },
]

export const REGISTRATION_CLOSES: Choice<CreateForm['registrationCloses']>[] = [
  { value: 15, label: '15 min before' },
  { value: 60, label: '1 h before' },
  { value: 180, label: '3 h before' },
  { value: 1440, label: '1 day before' },
]
export const CHECK_IN_BEFORE: Choice<CreateForm['checkInBefore']>[] = [
  { value: null, label: 'None' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 h before' },
]
const FINAL_FIRST_TO = [2, 3, 4, 5, 6, 7, 9, 11] as const
type FinalFirstTo = (typeof FINAL_FIRST_TO)[number]

/** "First to 3 legs wins the match (best of 5)." */
export const matchLengthLine = (n: number): string =>
  `First to ${n} ${n === 1 ? 'leg' : 'legs'} wins the match${n === 1 ? '' : ` (best of ${2 * n - 1})`}.`

/** Only a tournament that isn't public may wait for an organizer to start it. */
export const ORGANIZER_START_DISABLED =
  'Only for tournaments that aren’t public. Public tournaments always need a start time; switch to Friends or Invite link to start it yourself.'

export const startModeOf = (f: CreateForm): CreateForm['startMode'] => (f.access === 'public' ? 'fixed' : f.startMode)

export const sizeChoices = (f: CreateForm): Choice<CreateForm['maxEntries']>[] =>
  SIZES.map(({ value: n, label }) => ({
    value: n,
    label,
    disabled:
      f.format === 'round_robin' && n > ROUND_ROBIN_MAX_ENTRIES
        ? `A round robin has at most ${ROUND_ROBIN_MAX_ENTRIES}: everyone plays everyone.`
        : undefined,
  }))
const maxEntriesOf = (f: CreateForm): CreateForm['maxEntries'] =>
  f.format === 'round_robin' && f.maxEntries > ROUND_ROBIN_MAX_ENTRIES ? ROUND_ROBIN_MAX_ENTRIES : f.maxEntries

export const LONGER_FINAL_DISABLED = 'A round robin has no final.'
export const finalChoices = (f: CreateForm): Choice<FinalFirstTo>[] =>
  FINAL_FIRST_TO.map(n => ({
    value: n,
    label: String(n),
    disabled: n <= f.firstTo ? 'Pick a number higher than the normal match length.' : undefined,
  }))
/** The final's length: the chosen one, or the shortest that is still longer than a match. */
export const finalFirstToOf = (f: CreateForm): FinalFirstTo =>
  f.finalFirstTo > f.firstTo ? f.finalFirstTo : (FINAL_FIRST_TO.find(n => n > f.firstTo) ?? 11)

/** Check-in opens only once registration has closed. */
export const checkInChoices = (f: CreateForm): Choice<CreateForm['checkInBefore']>[] =>
  CHECK_IN_BEFORE.map(c => ({
    ...c,
    disabled: c.value !== null && c.value > f.registrationCloses ? 'Check-in opens once registration has closed.' : undefined,
  }))
export const checkInBeforeOf = (f: CreateForm): CreateForm['checkInBefore'] =>
  f.checkInBefore !== null && f.checkInBefore > f.registrationCloses ? 15 : f.checkInBefore

/** datetime-local value ↔ ISO instant, in the browser's time zone. */
export const fromLocal = (v: string): string => new Date(v).toISOString()
export function toLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** A fresh form: a public solo X01 knockout tomorrow at 19:00. */
export function defaultForm(now: Date): CreateForm {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19, 0)
  return {
    name: '',
    description: '',
    access: 'public',
    gameId: 'x01',
    startScore: 501,
    outMode: 'double',
    cricketMode: 'standard',
    firstTo: 3,
    longerFinal: false,
    finalFirstTo: 5,
    finalSemis: false,
    entry: 'solo',
    playersPerTeam: 2,
    format: 'single_elimination',
    maxEntries: 16,
    seeding: 'rating',
    groupSize: 4,
    through: 2,
    startMode: 'fixed',
    startsAt: toLocal(start.toISOString()),
    registrationCloses: 60,
    checkInBefore: 30,
    plannedFor: '',
    checkInAfter: 5,
    manualScoring: true,
    noShow: true,
    noShowMinutes: 10,
  }
}

/** What the form sends: only the settings that apply to what is picked. */
export function toInput(f: CreateForm): TournamentInput {
  const online = f.access !== 'in_person'
  const fixed = online && startModeOf(f) === 'fixed'
  const plannedFor = !fixed && f.plannedFor ? fromLocal(f.plannedFor) : null
  return {
    name: f.name.trim(),
    description: f.description.trim(),
    access: f.access,
    gameId: f.gameId,
    gameConfig: f.gameId === 'x01' ? { startScore: f.startScore, outMode: f.outMode } : { mode: f.cricketMode },
    format: f.format,
    teamSize: f.entry === 'solo' ? 1 : f.playersPerTeam,
    maxEntries: maxEntriesOf(f),
    startsAt: fixed && f.startsAt ? fromLocal(f.startsAt) : null,
    settings: {
      seeding: f.seeding,
      firstTo: f.firstTo,
      longerFinal: f.longerFinal && f.format !== 'round_robin' ? { firstTo: finalFirstToOf(f), semis: f.finalSemis } : null,
      groups: f.format === 'groups_knockout' ? { size: f.groupSize, through: f.through } : null,
      registrationClosesMinutes: fixed ? f.registrationCloses : null,
      checkInMinutes: !online ? null : fixed ? checkInBeforeOf(f) : f.checkInAfter,
      plannedFor,
      manualScoring: online && f.manualScoring,
      noShowMinutes: online && f.noShow ? f.noShowMinutes : null,
    },
  }
}

/** The choice whose value a stored one is, else the fallback (a value this form doesn't offer). */
const pick = <T>(choices: readonly Choice<T>[], v: unknown, fallback: T): T => choices.find(c => c.value === v)?.value ?? fallback

/** A stored tournament as the form shows it; the choices it doesn't use keep their defaults. */
export function fromTournament(t: Tournament, now: Date): CreateForm {
  const d = defaultForm(now)
  const s = t.settings
  const cfg = t.gameConfig
  const online = t.access !== 'in_person'
  const team = t.teamSize > 1
  return {
    ...d,
    name: t.name,
    description: t.description,
    access: t.access,
    gameId: t.gameId === 'cricket' ? 'cricket' : 'x01',
    startScore: pick(START_SCORES, cfg.startScore, d.startScore),
    outMode: pick(OUT_MODES, cfg.outMode, d.outMode),
    cricketMode: pick(CRICKET_MODES, cfg.mode, d.cricketMode),
    firstTo: s.firstTo,
    longerFinal: s.longerFinal !== null,
    finalFirstTo: s.longerFinal?.firstTo ?? d.finalFirstTo,
    finalSemis: s.longerFinal?.semis ?? false,
    entry: team ? 'teams' : 'solo',
    playersPerTeam: pick(PLAYERS_PER_TEAM, t.teamSize, d.playersPerTeam),
    format: t.format,
    maxEntries: pick(SIZES, t.maxEntries, d.maxEntries),
    seeding: s.seeding,
    groupSize: s.groups?.size ?? d.groupSize,
    through: s.groups?.through ?? d.through,
    startMode: t.startsAt === null ? 'organizer' : 'fixed',
    startsAt: t.startsAt ? toLocal(t.startsAt) : d.startsAt,
    registrationCloses: pick(REGISTRATION_CLOSES, s.registrationClosesMinutes, d.registrationCloses),
    checkInBefore: t.startsAt ? pick(CHECK_IN_BEFORE, s.checkInMinutes, null) : d.checkInBefore,
    plannedFor: s.plannedFor ? toLocal(s.plannedFor) : '',
    checkInAfter: pick(CHECK_IN_AFTER, s.checkInMinutes, d.checkInAfter),
    manualScoring: online ? s.manualScoring : d.manualScoring,
    noShow: online ? s.noShowMinutes !== null : d.noShow,
    noShowMinutes: pick(NO_SHOW_WAIT, s.noShowMinutes, d.noShowMinutes),
  }
}

const FIELD_LABELS: Record<string, string> = {
  'body/name': 'Name',
  'body/description': 'Description',
  'body/startsAt': 'Start',
  'body/maxEntries': 'Size',
  'body/gameConfig': 'Game',
  'body/settings/checkInMinutes': 'Check-in',
  'body/settings/registrationClosesMinutes': 'Registration',
  'body/settings/longerFinal': 'Longer final',
}

/** "Name: must be 3-40 characters", for the server's problems and the form's own. */
export const problemText = (p: { path: string; message: string }): string => `${FIELD_LABELS[p.path] ?? 'Setup'}: ${p.message}`

/** What keeps the form from saving, checked as the server will (a start time in the past included). */
export function formProblems(f: CreateForm, now: Date): string[] {
  const input = toInput(f)
  if (input.startsAt === null && startModeOf(f) === 'fixed' && f.access !== 'in_person')
    return [problemText({ path: 'body/startsAt', message: 'pick a start time' })]
  return [...setupProblems(input), ...startProblems(input, now)].map(problemText)
}

export interface Preview {
  access: string
  name: string
  pills: string[]
  when: string
  size: string
  help: string
  primary: string
  footnote: string
}

const ACCESS_PREVIEW: Record<TournamentAccess, string> = {
  public: 'public',
  friends: 'friends only',
  invite: 'invite link',
  in_person: 'players added by you',
}

const day = (d: Date) => `${weekday(d)} ${dayMonth(d)}`

/** The preview card: the tournament as Browse will list it. */
export function previewOf(f: CreateForm): Preview {
  const inPerson = f.access === 'in_person'
  const team = f.entry === 'teams'
  const fixed = !inPerson && startModeOf(f) === 'fixed'
  const start = f.startsAt ? new Date(f.startsAt) : null
  const planned = f.plannedFor ? new Date(f.plannedFor) : null
  const when = fixed
    ? start
      ? `${day(start)} · ${pad2(start.getHours())}:${pad2(start.getMinutes())}`
      : 'Pick a start time'
    : inPerson
      ? planned
        ? `${day(planned)} · in person`
        : 'In person'
      : 'Starts when you start it'
  return {
    access: ACCESS_PREVIEW[f.access],
    name: f.name.trim() || 'Your tournament',
    pills: [
      f.gameId === 'x01' ? `X01 ${f.startScore}` : 'Cricket',
      team ? `TEAMS OF ${f.playersPerTeam}` : 'SOLO',
      FORMATS.find(x => x.value === f.format)?.short ?? f.format,
      ...(inPerson ? ['IN PERSON'] : []),
    ],
    when,
    size: `${maxEntriesOf(f)} ${team ? 'teams' : 'players'}`,
    help: inPerson
      ? 'Played in Tournament mode on your devices. You can edit the players until you start it.'
      : `Community tournaments don’t give season points. You can edit everything until the first ${team ? 'team' : 'player'} registers; after that only the start time and description.`,
    primary: inPerson ? 'Create tournament' : 'Create & open registration',
    footnote: inPerson ? 'You’ll get claim links for every spot.' : 'You’ll get a link to share.',
  }
}

/** A failed publish still saved the draft: `id` names it, so a retry saves rather than creating another. */
export type SaveResult = { ok: true; id: string } | { ok: false; errors: string[]; id?: string }

const failed = (error: components['schemas']['ErrorResponse'] | undefined, status: number): { ok: false; errors: string[] } => {
  if (status === 409 && error?.error === 'limit reached')
    return { ok: false, errors: ['You already have 5 tournaments that aren’t finished. Finish or cancel one first.'] }
  if (status === 409 && error?.error === 'locked')
    return { ok: false, errors: ['Someone registered, so only the start time and description can change.'] }
  const details = error?.details ?? []
  return { ok: false, errors: details.length > 0 ? details.map(problemText) : ['Couldn’t save the tournament. Try again.'] }
}

/** A tournament to edit; null if it isn't there (or the caller may not see it). */
export async function loadTournament(id: string): Promise<Tournament | null> {
  return (await api.GET('/api/tournaments/{id}', { params: { path: { id } } })).data ?? null
}

/** Creates the tournament (or saves `id`), then publishes it when asked. */
export async function saveTournament(input: TournamentInput, opts: { id?: string; publish: boolean }): Promise<SaveResult> {
  const saved = opts.id
    ? await api.PATCH('/api/tournaments/{id}', { params: { path: { id: opts.id } }, body: input })
    : await api.POST('/api/tournaments', { body: input })
  if (!saved.data) return failed(saved.error, saved.response.status)
  const id = saved.data.id
  if (opts.publish && saved.data.status === 'draft') {
    const published = await api.POST('/api/tournaments/{id}/publish', { params: { path: { id } } })
    if (!published.data) return { ...failed(published.error, published.response.status), id }
  }
  return { ok: true, id }
}
