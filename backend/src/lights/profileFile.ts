// A light profile as a file: the format players export and import. A file is a trust boundary, so
// import checks every field, clamps numbers into range, drops what it doesn't know and says what it
// dropped. A Dartcade preset look is one of the built-in preset names, and import takes the state
// from there; a raw look carries only the WLED keys `checkWledState` allows. It never carries a
// device address, an id or any token.
import {
  DEFAULT_SEAT_COLORS,
  MAX_RULES,
  RULE_FIELDS,
  PRESETS,
  SEAT_COLOR_COUNT,
  hexColor,
  kinded,
  ruleSchema,
  unknownLook,
  type Look,
  type Profile,
  type Rule,
} from '../shared/lights/index.js'

export const PROFILE_FORMAT = 'dartcade-light-profile'
export const PROFILE_VERSION = 1
/** The most a file can hold: its size is limited by the route, and so is what the profile gets out of it. */
export const MAX_EFFECTS = MAX_RULES
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
  look: Exclude<Look, { state: unknown }> | { preset: string }
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

/** A look in a file: Dartcade's presets by name, never their state; every other look as it is. */
function fileLook(look: Look): EffectFile['look'] {
  const l = kinded(look)
  switch (l.kind) {
    case 'preset':
      return { preset: presetNameOf(l.look.state) ?? l.look.preset }
    case 'color':
    case 'ps':
    case 'pl':
    case 'raw':
      return l.look
    default:
      return unknownLook(l)
  }
}

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
      look: fileLook(r.look),
      ...(r.holdMs !== undefined && { holdMs: r.holdMs }),
    })),
  }
}

const hex = hexColor

const known = {
  // A file's effect keeps the rule's fields with its `when` flattened into it (`asRule` puts it back)
  effect: new Set([...RULE_FIELDS.when, ...RULE_FIELDS.rule.filter(k => k !== 'when')]),
  look: new Set(RULE_FIELDS.look),
  file: new Set(['format', 'version', 'name', 'seatColors', 'effects']),
}
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const extraKeys = (v: Record<string, unknown>, allowed: Set<string>) => Object.keys(v).filter(k => !allowed.has(k))

export type ImportResult =
  | { ok: true; name: string; seatColors: string[]; rules: Rule[]; imported: number; ignored: string[]; adjusted: string[] }
  | { ok: false; error: string }

/** A profile name from outside: control characters and runs of spaces become one space, trimmed and cut to `MAX_NAME`;
 *  '' when nothing is left. */
export const trimName = (v: unknown): string => {
  // eslint-disable-next-line no-control-regex -- the point is to remove them
  const name =
    typeof v === 'string'
      ? v
          .replace(/[\u0000-\u001f\u007f]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, MAX_NAME)
      : ''
  return name
}

/** A look's numbers as import moved them into range: the name it reports, the file's key, the value it became. */
function lookNumbers(look: Look): [string, string, number | undefined][] {
  const l = kinded(look)
  switch (l.kind) {
    case 'color':
      return [
        ['effect id', 'fx', l.look.fx],
        ['brightness', 'bri', l.look.bri],
        ['speed', 'speed', l.look.speed],
        ['intensity', 'ix', l.look.ix],
        ['palette', 'pal', l.look.pal],
      ]
    case 'ps':
      return [['preset id', 'ps', l.look.ps]]
    case 'pl':
      return [['playlist id', 'pl', l.look.pl]]
    case 'preset':
    case 'raw':
      return []
    default:
      return unknownLook(l)
  }
}

/** A file's effect in the shape of a rule, for `ruleSchema` to check: the file keeps `when` flat. */
const asRule = (e: Record<string, unknown>) => ({
  when: { trigger: e.trigger, seats: e.seats, total: e.total, game: e.game },
  type: e.type,
  enabled: e.enabled ?? true,
  look: e.look,
  holdMs: e.holdMs,
})

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
    const parsed = ruleSchema.safeParse(asRule(effect))
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue.path[0] === 'when' ? issue.path[1] : issue.path[0]
      // A raw look says which WLED key it refused; any other field only that it is not valid
      const why = issue.code === 'custom' && field === 'look' ? `: ${issue.message}` : ''
      return void ignored.push(
        field === 'trigger' ? `${at}: unknown effect "${String(effect.trigger)}"` : `${at}: ${String(field)} is not valid${why}`,
      )
    }
    for (const k of extraKeys(effect, known.effect)) ignored.push(`${at}: unknown field "${k}"`)
    if (isRecord(effect.look)) for (const k of extraKeys(effect.look, known.look)) ignored.push(`${at}: unknown look field "${k}"`)
    const rule = parsed.data
    // Every number that was out of range, by what it was in the file and what it became
    const look = isRecord(effect.look) ? effect.look : {}
    const was = isRecord(effect.total) ? effect.total : {}
    const total = rule.when.total
    const numbers: [string, unknown, number | undefined][] = [
      ...lookNumbers(rule.look).map(([name, key, after]): [string, unknown, number | undefined] => [name, look[key], after]),
      ['visit total', was.n, total?.n],
      ['visit total', was.to, total?.op === 'between' ? total.to : undefined],
      ['hold time', effect.holdMs, rule.holdMs],
    ]
    for (const [name, before, after] of numbers)
      if (after !== undefined && before !== after) adjusted.push(`${at}: ${name} moved into range`)
    rules.push(rule)
  })
  if (raw.effects.length > MAX_EFFECTS) ignored.push(`${raw.effects.length - MAX_EFFECTS} effects past the ${MAX_EFFECTS}th`)
  if (rules.length === 0) return { ok: false, error: 'The file has no effect this server can use.' }

  return { ok: true, name: trimName(raw.name) || 'Imported profile', seatColors, rules, imported: rules.length, ignored, adjusted }
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
