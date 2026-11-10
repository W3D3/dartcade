// A light profile as a file: the format players export and import. A file is a trust boundary, so
// import checks every field, clamps numbers into range, drops what it doesn't know and says what it
// dropped. It never carries WLED state: a preset look is one of the built-in preset names, and
// import takes the state from there. It never carries a device address, an id or any token either.
import { z } from 'zod'
import { isGameId } from '../shared/gameNames.js'
import {
  DEFAULT_SEAT_COLORS,
  PRESETS,
  SEAT_COLOR_COUNT,
  TRIGGER_GAME,
  type Profile,
  type Rule,
  type TriggerKind,
} from '../shared/lights/index.js'

export const PROFILE_FORMAT = 'dartcade-light-profile'
export const PROFILE_VERSION = 1
/** The most a file can hold: its size is limited by the route, and so is what the profile gets out of it. */
export const MAX_EFFECTS = 100
export const MAX_NAME = 60
/** How many profiles of their own a player can have. */
export const MAX_LIGHT_PROFILES = 20
/** The biggest file the import route reads. */
export const MAX_PROFILE_FILE_BYTES = 128 * 1024

export type EffectFile = {
  trigger: string
  seats: Rule['when']['seats']
  total?: NonNullable<Rule['when']['total']>
  game?: string
  type: Rule['type']
  enabled: boolean
  look: { color: string; fx: number; bri: number; speed?: number } | { preset: string }
  holdMs?: number
}

export type ProfileFile = {
  format: typeof PROFILE_FORMAT
  version: typeof PROFILE_VERSION
  name: string
  seatColors: string[]
  effects: EffectFile[]
}

const presetNameOf = (state: unknown): string | undefined => Object.entries(PRESETS).find(([, s]) => s === state)?.[0]

/** The file for a profile: its name, seat colours and effects, with preset looks by name. */
export function exportProfile(profile: Profile): ProfileFile {
  return {
    format: PROFILE_FORMAT,
    version: PROFILE_VERSION,
    name: profile.name,
    seatColors: [...profile.seatColors],
    effects: profile.rules.map(r => ({
      trigger: r.when.trigger,
      seats: r.when.seats,
      ...(r.when.total && { total: r.when.total }),
      ...(r.when.game && { game: r.when.game }),
      type: r.type,
      enabled: r.enabled,
      look: 'preset' in r.look ? { preset: presetNameOf(r.look.state) ?? r.look.preset } : r.look,
      ...(r.holdMs !== undefined && { holdMs: r.holdMs }),
    })),
  }
}

const int = (min: number, max: number) => z.number().transform(n => Math.min(max, Math.max(min, Math.round(n))))
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s): `#${string}` => `#${s.slice(1).toLowerCase()}`)

const isTrigger = (s: string): s is TriggerKind => Object.hasOwn(TRIGGER_GAME, s)

const lookSchema = z.union([
  z.object({ preset: z.string().refine(name => Object.hasOwn(PRESETS, name), 'unknown preset') }),
  z.object({
    color: z.union([z.literal('seat'), z.literal('team'), hex]),
    fx: int(0, 255),
    bri: int(0, 255),
    speed: int(0, 255).optional(),
  }),
])

const effectSchema = z.object({
  trigger: z.string().refine(isTrigger, 'unknown trigger'),
  seats: z.enum(['any', 'mine', 'other']),
  total: z.object({ op: z.enum(['=', '>=']), n: int(0, 180) }).optional(),
  game: z.string().refine(isGameId, 'unknown game').optional(),
  type: z.enum(['scene', 'flash']),
  enabled: z.boolean().default(true),
  look: lookSchema,
  holdMs: int(100, 60_000).optional(),
})

const known = {
  effect: new Set(Object.keys(effectSchema.shape)),
  look: new Set(['preset', 'color', 'fx', 'bri', 'speed']),
  file: new Set(['format', 'version', 'name', 'seatColors', 'effects']),
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const extraKeys = (v: Record<string, unknown>, allowed: Set<string>) => Object.keys(v).filter(k => !allowed.has(k))

export type ImportResult =
  | { ok: true; name: string; seatColors: string[]; rules: Rule[]; imported: number; ignored: string[]; adjusted: string[] }
  | { ok: false; error: string }

const trimName = (v: unknown): string => {
  // eslint-disable-next-line no-control-regex -- the point is to remove them
  const name =
    typeof v === 'string'
      ? v
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, MAX_NAME)
      : ''
  return name || 'Imported profile'
}

function ruleOf(e: z.infer<typeof effectSchema>): Rule {
  const look: Rule['look'] = 'preset' in e.look ? { preset: e.look.preset, state: PRESETS[e.look.preset] } : e.look
  return {
    when: {
      trigger: e.trigger,
      seats: e.seats,
      ...(e.trigger === 'visit' && e.total && { total: e.total }),
      ...(e.game && { game: e.game }),
    },
    type: e.type,
    enabled: e.enabled,
    look,
    ...(e.holdMs !== undefined && { holdMs: e.holdMs }),
  }
}

/** Reads a parsed file: the profile it makes, how many effects came through, what was ignored (an effect or a field
 *  it doesn't know) and what was changed to fit (a number moved into range, a colour replaced). */
export function importProfile(raw: unknown): ImportResult {
  if (!isRecord(raw) || raw.format !== PROFILE_FORMAT) return { ok: false, error: 'This is not a Dartcade light profile file.' }
  if (raw.version !== PROFILE_VERSION)
    return { ok: false, error: `This file is version ${String(raw.version)}; this server reads version ${PROFILE_VERSION}.` }
  if (!Array.isArray(raw.effects)) return { ok: false, error: 'The file has no list of effects.' }

  const ignored: string[] = []
  const adjusted: string[] = []
  for (const k of extraKeys(raw, known.file)) ignored.push(`unknown field "${k}"`)

  const colors = Array.isArray(raw.seatColors) ? raw.seatColors : []
  if (!Array.isArray(raw.seatColors)) adjusted.push('no seat colours: the defaults were used')
  if (colors.length > SEAT_COLOR_COUNT) ignored.push(`${colors.length - SEAT_COLOR_COUNT} seat colours past the sixth`)
  const seatColors = DEFAULT_SEAT_COLORS.map((fallback, i) => {
    if (i >= colors.length && Array.isArray(raw.seatColors)) adjusted.push(`seat ${i + 1} had no colour: the default was used`)
    const parsed = hex.safeParse(colors[i])
    if (!parsed.success && i < colors.length) adjusted.push(`seat ${i + 1} colour was not #rrggbb: the default was used`)
    return parsed.success ? parsed.data : fallback
  })

  const rules: Rule[] = []
  raw.effects.slice(0, MAX_EFFECTS).forEach((effect: unknown, i) => {
    const at = `effect ${i + 1}`
    if (!isRecord(effect)) return void ignored.push(`${at}: not an object`)
    const parsed = effectSchema.safeParse(effect)
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0]
      return void ignored.push(
        field === 'trigger' ? `${at}: unknown effect "${String(effect.trigger)}"` : `${at}: ${String(field)} is not valid`,
      )
    }
    for (const k of extraKeys(effect, known.effect)) ignored.push(`${at}: unknown field "${k}"`)
    if (isRecord(effect.look)) for (const k of extraKeys(effect.look, known.look)) ignored.push(`${at}: unknown look field "${k}"`)
    const rule = ruleOf(parsed.data)
    // Every number that was out of range, by what it was in the file and what it became
    const look = isRecord(effect.look) ? effect.look : {}
    const was = isRecord(effect.total) ? effect.total : {}
    const colorLook = 'preset' in rule.look ? undefined : rule.look
    const numbers: [string, unknown, number | undefined][] = [
      ['effect id', look.fx, colorLook?.fx],
      ['brightness', look.bri, colorLook?.bri],
      ['speed', look.speed, colorLook?.speed],
      ['visit total', was.n, rule.when.total?.n],
      ['hold time', effect.holdMs, rule.holdMs],
    ]
    for (const [name, before, after] of numbers)
      if (after !== undefined && before !== after) adjusted.push(`${at}: ${name} moved into range`)
    rules.push(rule)
  })
  if (raw.effects.length > MAX_EFFECTS) ignored.push(`${raw.effects.length - MAX_EFFECTS} effects past the ${MAX_EFFECTS}th`)
  if (rules.length === 0) return { ok: false, error: 'The file has no effect this server can use.' }

  return { ok: true, name: trimName(raw.name), seatColors, rules, imported: rules.length, ignored, adjusted }
}

/** The name, or the name with " 2", " 3" … once it is taken (compared without case). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(n => n.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, MAX_NAME - String(n).length - 1)} ${n}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}
