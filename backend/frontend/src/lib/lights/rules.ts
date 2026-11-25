// The rule editor's model (Settings-Lights-Rules): a rule as a flat form, so switching the look
// or the filter keeps what was typed in the others; the rule it makes, checked by the server's own
// schema; the line that says what it does; and the effects and palettes the board's devices offer.
import type { LightRule } from '$lib/api'
import { gameTitle, GAME_NAMES, isGameId, type GameId } from '$shared/gameNames.js'
import {
  checkWledState,
  FX,
  isTrigger,
  kinded,
  PRESETS,
  ruleSchema,
  STRIP_PRESET_IDS,
  TRIGGER_GAME,
  unknownLook,
  type TriggerKind,
} from '$shared/lights/index.js'
import { COMMON_EFFECTS, COMMON_PALETTES } from './wledNames'
import { colorLabel, totalLabel, TRIGGER_LABELS } from './view'

export type LookTab = 'color' | 'preset' | 'playlist' | 'raw'
export type ColorMode = 'seat' | 'team' | 'fixed'
export type TotalOp = 'any' | '=' | '>=' | '<=' | 'between'

export type RuleForm = {
  trigger: TriggerKind
  seats: LightRule['when']['seats']
  /** '' for every game. */
  game: GameId | ''
  op: TotalOp
  n: number
  to: number
  type: LightRule['type']
  enabled: boolean
  holdMs: number
  look: LookTab
  colorMode: ColorMode
  fixed: string
  fx: number
  bri: number
  speed: number
  ix: number
  pal: number
  /** The WLED preset tab: one saved on the strip, or one of Dartcade's own. */
  presetSource: 'strip' | 'dartcade'
  ps: number
  presetName: string
  pl: number
  raw: string
}

const DEFAULT_SPEED = 128
const DEFAULT_IX = 128
const DEFAULT_HOLD = 2000

/** Every trigger a rule can answer, in the editor's order. Takeout finished is left out: the lights never match a rule for
 *  it, they bring the game's scene back. */
export const RULE_TRIGGERS: readonly TriggerKind[] = Object.keys(TRIGGER_GAME)
  .filter(isTrigger)
  .filter(k => k !== 'takeout.finished')

/** Triggers that belong to no seat: they always fire on this board. */
const SEATLESS: ReadonlySet<TriggerKind> = new Set(['lobby', 'takeout.started', 'takeout.finished', 'calibration.finished'])
export const hasSeat = (t: TriggerKind): boolean => !SEATLESS.has(t)

export const TRIGGER_OPTIONS = RULE_TRIGGERS.map(t => {
  const game = TRIGGER_GAME[t]
  return { value: t, label: game ? `${TRIGGER_LABELS[t]} · ${gameTitle(game)}` : TRIGGER_LABELS[t] }
})

export const SEAT_OPTIONS: { value: LightRule['when']['seats']; label: string }[] = [
  { value: 'any', label: 'any seat' },
  { value: 'mine', label: "this board's seats" },
  { value: 'other', label: 'the other board' },
]

export const GAME_OPTIONS: { value: GameId | ''; label: string }[] = [
  { value: '', label: 'every game' },
  ...Object.keys(GAME_NAMES)
    .filter(isGameId)
    .map(id => ({ value: id, label: gameTitle(id) })),
]

export const OP_OPTIONS: { value: TotalOp; label: string }[] = [
  { value: 'any', label: 'any total' },
  { value: '=', label: '=' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'between', label: 'between' },
]

type LookFields = Pick<
  RuleForm,
  'look' | 'colorMode' | 'fixed' | 'fx' | 'bri' | 'speed' | 'ix' | 'pal' | 'presetSource' | 'ps' | 'presetName' | 'pl' | 'raw'
>

/** The look fields of a form before any look filled them in. */
const LOOK_DEFAULTS: LookFields = {
  look: 'color',
  colorMode: 'seat',
  fixed: '#ffffff',
  fx: FX.solid,
  bri: 255,
  speed: DEFAULT_SPEED,
  ix: DEFAULT_IX,
  pal: 0,
  presetSource: 'strip',
  ps: 1,
  presetName: Object.keys(PRESETS)[0],
  pl: 1,
  raw: JSON.stringify({ on: true, bri: 255, seg: [{ id: 0, fx: FX.solid }] }, null, 2),
}

/** The look fields a look fills in; the rest keep their defaults. */
function lookFields(look: LightRule['look']): Partial<LookFields> {
  const l = kinded(look)
  switch (l.kind) {
    case 'color': {
      const { color, fx, bri, speed, ix, pal } = l.look
      return {
        look: 'color',
        colorMode: color === 'seat' ? 'seat' : color === 'team' ? 'team' : 'fixed',
        ...(color.startsWith('#') && { fixed: color }),
        fx,
        bri,
        speed: speed ?? DEFAULT_SPEED,
        ix: ix ?? DEFAULT_IX,
        pal: pal ?? 0,
        raw: JSON.stringify({ on: true, bri: 255, seg: [{ id: 0, fx }] }, null, 2),
      }
    }
    case 'preset':
      return { look: 'preset', presetSource: 'dartcade', presetName: l.look.preset }
    case 'ps':
      return { look: 'preset', presetSource: 'strip', ps: l.look.ps }
    case 'pl':
      return { look: 'playlist', pl: l.look.pl }
    case 'raw':
      return { look: 'raw', raw: JSON.stringify(l.look.raw, null, 2) }
    default:
      return unknownLook(l)
  }
}

/** The form for a rule; a look of another kind keeps the defaults in its own fields. */
export function formOf(rule: LightRule): RuleForm {
  const total = rule.when.total
  return {
    trigger: isTrigger(rule.when.trigger) ? rule.when.trigger : 'turn',
    seats: rule.when.seats,
    game: rule.when.game && isGameId(rule.when.game) ? rule.when.game : '',
    op: total ? total.op : 'any',
    n: total?.n ?? 100,
    to: total?.to ?? 180,
    type: rule.type,
    enabled: rule.enabled,
    holdMs: rule.holdMs ?? DEFAULT_HOLD,
    ...LOOK_DEFAULTS,
    ...lookFields(rule.look),
  }
}

/** A new rule: a big score flashes the thrower's seat colour. */
export const NEW_RULE: LightRule = {
  when: { trigger: 'visit', seats: 'mine', total: { op: '>=', n: 100 } },
  type: 'flash',
  enabled: true,
  look: { color: 'seat', fx: FX.blink, bri: 255 },
  holdMs: DEFAULT_HOLD,
}

function lookOf(f: RuleForm): LightRule['look'] | { problems: string[] } {
  switch (f.look) {
    case 'color':
      return {
        color: f.colorMode === 'fixed' ? f.fixed.toLowerCase() : f.colorMode,
        fx: f.fx,
        bri: f.bri,
        ...(f.speed !== DEFAULT_SPEED && { speed: f.speed }),
        ...(f.ix !== DEFAULT_IX && { ix: f.ix }),
        ...(f.pal !== 0 && { pal: f.pal }),
      }
    case 'preset':
      return f.presetSource === 'dartcade' ? { preset: f.presetName } : { ps: f.ps }
    case 'playlist':
      return { pl: f.pl }
    case 'raw': {
      let parsed: unknown
      try {
        parsed = JSON.parse(f.raw)
      } catch {
        return { problems: ['This is not valid JSON.'] }
      }
      const checked = checkWledState(parsed)
      return checked.ok ? { raw: checked.state } : { problems: checked.problems }
    }
  }
}

const stripIdProblem = (n: number, what: string): string | null =>
  Number.isInteger(n) && n >= STRIP_PRESET_IDS.min && n <= STRIP_PRESET_IDS.max
    ? null
    : `A ${what} id is a whole number from ${STRIP_PRESET_IDS.min} to ${STRIP_PRESET_IDS.max}.`

/** The rule the form makes, or what stops it: the server's checks, run here first. */
export function ruleOf(f: RuleForm): { rule: LightRule } | { problems: string[] } {
  const look = lookOf(f)
  if ('problems' in look) return look
  const idProblem =
    f.look === 'playlist'
      ? stripIdProblem(f.pl, 'playlist')
      : f.look === 'preset' && f.presetSource === 'strip'
        ? stripIdProblem(f.ps, 'preset')
        : null
  if (idProblem) return { problems: [idProblem] }
  const total =
    f.trigger !== 'visit' || f.op === 'any'
      ? undefined
      : f.op === 'between'
        ? { op: f.op, n: Math.min(f.n, f.to), to: Math.max(f.n, f.to) }
        : { op: f.op, n: f.n }
  const rule: LightRule = {
    when: {
      trigger: f.trigger,
      seats: hasSeat(f.trigger) ? f.seats : 'any',
      ...(total && { total }),
      ...(f.game && TRIGGER_GAME[f.trigger] === null && { game: f.game }),
    },
    type: f.type,
    enabled: f.enabled,
    look,
    ...(f.type === 'flash' && { holdMs: f.holdMs }),
  }
  const checked = ruleSchema.safeParse(rule)
  if (!checked.success) return { problems: checked.error.issues.map(i => i.message) }
  return { rule }
}

const plain = (s: string) => s.toLowerCase()
const seconds = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`

/** A look in words, for `describeRule`. */
function lookWords(look: LightRule['look'], effectName: (fx: number) => string, paletteName: (pal: number) => string): string {
  const l = kinded(look)
  switch (l.kind) {
    case 'color': {
      const { color, fx, bri, speed, ix, pal } = l.look
      return [
        colorLabel(color),
        `${effectName(fx)} #${fx}`,
        `brightness ${bri}`,
        `speed ${speed ?? DEFAULT_SPEED}`,
        ...(ix !== undefined ? [`intensity ${ix}`] : []),
        ...(pal ? [`palette ${paletteName(pal)}`] : []),
      ].join(', ')
    }
    case 'preset':
      return `Dartcade's ${l.look.preset} preset`
    case 'ps':
      return `preset ${l.look.ps} saved on your strip`
    case 'pl':
      return `playlist ${l.look.pl} saved on your strip`
    case 'raw':
      return `your own WLED state (${Object.keys(l.look.raw).join(', ')})`
    default:
      return unknownLook(l)
  }
}

/** What a rule does, in words: 'Flashes for 4 s on top: the seat colour, Fireworks #42, brightness 255, speed 160. When a
 *  visit scores = 180, on any seat, in X01.' */
export function describeRule(rule: LightRule, effectName: (fx: number) => string, paletteName: (pal: number) => string): string {
  const how = rule.type === 'flash' ? `Flashes for ${seconds(rule.holdMs ?? DEFAULT_HOLD)} on top` : 'Stays until the next scene'
  const what = lookWords(rule.look, effectName, paletteName)
  const trigger = isTrigger(rule.when.trigger) ? plain(TRIGGER_LABELS[rule.when.trigger]) : rule.when.trigger
  const total = totalLabel(rule.when.total)
  const when = [`When ${trigger}${total ? ` (total ${total})` : ''}`]
  if (isTrigger(rule.when.trigger) && hasSeat(rule.when.trigger))
    when.push(`on ${SEAT_OPTIONS.find(o => o.value === rule.when.seats)?.label ?? rule.when.seats}`)
  const game = rule.when.game ?? (isTrigger(rule.when.trigger) ? TRIGGER_GAME[rule.when.trigger] : null)
  when.push(game ? `in ${gameTitle(game)}` : 'in every game')
  return `${how}: ${what}. ${when.join(', ')}.${rule.enabled ? '' : ' Switched off.'}`
}

/** A list WLED reports keeps reserved ids as 'RSVD' or '-'. */
const reserved = (name: string | undefined) => !name || name === 'RSVD' || name === '-'

export type NameChoice = { id: number; name: string; missingOn: string[] }

/** The effects (or palettes) to pick from: every id a device of the board reported, each with the devices that lack it; the
 *  common WLED list while no device has reported one. `current` is always offered, so a rule never shows an empty pick. */
export function nameChoices(
  devices: readonly { name: string; list?: readonly string[] }[],
  common: Readonly<Partial<Record<number, string>>>,
  current: number,
): { fromDevices: boolean; choices: NameChoice[] } {
  const reporting = devices.filter(d => d.list && d.list.length > 0)
  const byId = new Map<number, string>()
  for (const d of reporting) d.list?.forEach((name, id) => !reserved(name) && !byId.has(id) && byId.set(id, name))
  const fromDevices = reporting.length > 0
  if (!fromDevices) for (const [id, name] of Object.entries(common)) if (name) byId.set(Number(id), name)
  if (!byId.has(current)) byId.set(current, `Effect ${current}`)
  const choices = [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, name]) => ({ id, name, missingOn: reporting.filter(d => reserved(d.list?.[id])).map(d => d.name) }))
  return { fromDevices, choices }
}

export const effectChoices = (devices: readonly { name: string; effects?: string[] }[], current: number) =>
  nameChoices(
    devices.map(d => ({ name: d.name, list: d.effects })),
    COMMON_EFFECTS,
    current,
  )

export const paletteChoices = (devices: readonly { name: string; palettes?: string[] }[], current: number) =>
  nameChoices(
    devices.map(d => ({ name: d.name, list: d.palettes })),
    COMMON_PALETTES,
    current,
  )

/** The hint under the effect pick when a device lacks it: WLED itself plays Solid for an effect it does not have. */
export function missingHint(choice: NameChoice | undefined): string | null {
  if (!choice || choice.missingOn.length === 0) return null
  return `Not on ${choice.missingOn.join(', ')}: ${choice.missingOn.length === 1 ? 'it plays' : 'they play'} Solid instead.`
}

/** The hold slider: half a second to ten (a file may hold up to `HOLD_MS.max`, which the slider then shows at its end). */
export const HOLD_RANGE = { min: 500, max: 10_000, step: 100 } as const
