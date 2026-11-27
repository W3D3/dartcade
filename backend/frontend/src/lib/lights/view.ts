// Pure helpers for Settings' Lights section: formatting a light profile's rules, a device's
// segment layout and "since" timestamps, and whether a flagged settings section shows.
import { FX, GROUP_ORDER, kinded, TAKEOUT_YELLOW, TRIGGER_GAME, unknownLook, type GameId, type TriggerKind } from '$shared/lights/index.js'
import { SEAT_PALETTE } from './seatColors.js'
import { COMMON_EFFECTS } from './wledNames'
import { gameTitle } from '$shared/gameNames.js'

export type SegmentMode = 'whole' | 'perSeat' | 'wled'

/** A rule's shape as seen here: loose enough for both the generated `LightRule` (from `$lib/api`)
 *  and the shared `Rule` (from `$shared/lights`, used directly in tests). */
type RuleLike = {
  when: { trigger: string; seats: string; total?: { op: string; n: number; to?: number }; game?: string }
  type: string
  look:
    | { color: string; fx: number; bri: number; speed?: number }
    | { preset: string; state?: unknown }
    | { ps: number }
    | { pl: number }
    | { raw: Record<string, unknown> }
  enabled: boolean
  holdMs?: number
}

/** A trigger's name in the Effects list and the rule editor. */
export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  turn: 'Turn changes',
  visit: 'Visit scored',
  bust: 'Bust',
  checkout: 'Checkout',
  'game.won': 'Game won',
  'cricket.closed': 'Number closed',
  'p121.made': 'Target made',
  'hilo.lifeLost': 'Life lost',
  'golf.sunk': 'Ball sunk',
  'dungeon.hit': 'Enemy hit',
  'dungeon.kill': 'Enemy defeated',
  'dungeon.hurt': 'Hero hurt',
  'dungeon.victory': 'Victory',
  'dungeon.defeat': 'Defeat',
  'bulloff.won': 'Bull off won',
  'takeout.started': 'Takeout',
  'takeout.finished': 'Takeout',
  'calibration.finished': 'Calibrated',
  lobby: 'Lobby',
}

const TRIGGER_HINTS: Record<string, string> = { lobby: 'Shows only while you are in a lobby with no game running' }

// The seat palette's names, plus the takeout yellow the palette does not offer
const COLOR_NAMES: Record<string, string> = {
  ...Object.fromEntries(SEAT_PALETTE.map(c => [c.hex, c.name])),
  [TAKEOUT_YELLOW]: 'yellow',
}

const FX_NAMES: Partial<Record<number, string>> = Object.fromEntries(Object.entries(FX).map(([name, id]) => [id, name]))

export const colorLabel = (color: string): string =>
  color === 'seat' ? 'seat colour' : color === 'team' ? 'team colour' : (COLOR_NAMES[color] ?? color)

const fxLabel = (fx: number): string => FX_NAMES[fx] ?? COMMON_EFFECTS[fx]?.toLowerCase() ?? `fx ${fx}`

// 4000 -> '4 s', 1500 -> '1.5 s'
const holdLabel = (holdMs: number): string => `${Number((holdMs / 1000).toFixed(1))} s`

/** A visit total filter in a chip: '= 180', '≥ 100', '≤ 20', '100–139'. */
export function totalLabel(total: RuleLike['when']['total']): string | null {
  if (!total) return null
  if (total.op === 'between') return `${total.n}–${total.to ?? total.n}`
  return `${total.op === '>=' ? '≥' : total.op === '<=' ? '≤' : '='} ${total.n}`
}

const isRgb = (c: unknown): c is number[] => Array.isArray(c) && c.length >= 3 && c.every(n => typeof n === 'number')
const hexOf = (c: number[]) =>
  `#${c
    .slice(0, 3)
    .map(n => n.toString(16).padStart(2, '0'))
    .join('')}`

/** The colours a rule's row shows next to its look: the seat colours it uses, its fixed colour, or the first colours a WLED
 *  state sets; none for a preset or playlist on the strip, whose colours only the strip knows. */
export function lookSwatches(look: RuleLike['look'], seatColors: readonly string[]): string[] {
  const l = kinded(look)
  switch (l.kind) {
    case 'color':
      return l.look.color === 'seat' || l.look.color === 'team' ? seatColors.slice(0, 3) : [l.look.color]
    case 'preset':
      return stateSwatches(l.look.state)
    case 'raw':
      return stateSwatches(l.look.raw)
    case 'ps':
    case 'pl':
      return []
    default:
      return unknownLook(l)
  }
}

/** The first colour of each segment a WLED state sets, at most three. */
function stateSwatches(state: unknown): string[] {
  const segs = typeof state === 'object' && state !== null && 'seg' in state && Array.isArray(state.seg) ? state.seg : []
  const colors = segs.flatMap((seg: unknown) =>
    typeof seg === 'object' && seg !== null && 'col' in seg && Array.isArray(seg.col) ? seg.col.filter(isRgb).slice(0, 1).map(hexOf) : [],
  )
  return [...new Set(colors)].slice(0, 3)
}

/** A look in a few words, for its row: 'seat colour · pulse', 'strip preset 7', 'raw JSON'. */
function lookLabel(look: RuleLike['look']): string {
  const l = kinded(look)
  switch (l.kind) {
    case 'color':
      return `${colorLabel(l.look.color)} · ${fxLabel(l.look.fx)}`
    case 'preset':
      return `${l.look.preset} preset`
    case 'ps':
      return `strip preset ${l.look.ps}`
    case 'pl':
      return `playlist ${l.look.pl}`
    case 'raw':
      return 'raw JSON'
    default:
      return unknownLook(l)
  }
}

/** A rule's row in the Light profile card: when it fires, its filter chip, type and look. */
export function ruleLabel(rule: RuleLike): {
  when: string
  filter: string | null
  type: 'Scene' | 'Flash'
  look: string
  enabled: boolean
  hint: string | null
} {
  const totalPart = totalLabel(rule.when.total)
  const otherPart = rule.when.seats === 'other' ? 'other board' : null
  const gamePart = rule.when.game ? gameTitle(rule.when.game) : null
  const filterParts = [totalPart, otherPart, gamePart].filter((p): p is string => p !== null)
  const holdPart = rule.type === 'flash' && rule.holdMs ? ` · ${holdLabel(rule.holdMs)}` : ''
  return {
    when: isTriggerKind(rule.when.trigger) ? TRIGGER_LABELS[rule.when.trigger] : rule.when.trigger,
    filter: filterParts.length ? filterParts.join(' · ') : null,
    type: rule.type === 'scene' ? 'Scene' : 'Flash',
    look: `${lookLabel(rule.look)}${holdPart}`,
    enabled: rule.enabled,
    hint: TRIGGER_HINTS[rule.when.trigger] ?? null,
  }
}

/** How a device's LEDs are split: '4 × 36 LEDs', '3 × 36 + 37 LEDs', '120 LEDs', '3 WLED segments'. */
export function segmentHint(leds: number, mode: SegmentMode, seats: number, wledSegments: number): string {
  if (mode === 'whole') return `${leds} LEDs`
  if (mode === 'wled') return `${wledSegments} WLED segment${wledSegments === 1 ? '' : 's'}`
  const n = Math.max(1, seats)
  const size = Math.floor(leds / n)
  if (leds % n === 0) return `${n} × ${size} LEDs`
  return `${n - 1} × ${size} + ${leds - (n - 1) * size} LEDs`
}

/** A device row's segment summary: 'Whole strip', 'One per seat', 'WLED segments · 2'. */
export function deviceSummary(d: { segmentMode: SegmentMode; segments: number }): string {
  if (d.segmentMode === 'whole') return 'Whole strip'
  if (d.segmentMode === 'perSeat') return 'One per seat'
  return `WLED segments · ${d.segments}`
}

/** '2 min ago' / '3 h ago' (from 60 min) / 'just now'; '' without a timestamp. */
export function since(iso: string | undefined, now: Date): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const ms = now.getTime() - then
  if (ms < 60_000) return 'just now'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

/** Whether a settings section shows: always, unless it names a flag that's off. */
export function sectionVisible(s: { flag?: string; [key: string]: unknown }, flags: Partial<Record<string, boolean>>): boolean {
  return !s.flag || flags[s.flag] === true
}

/** A board button's count label in the picker: the device count once it's loaded, an em dash
 * while it hasn't (never "0 devices" for a board we haven't heard back from), or "offline". */
export function boardDeviceLabel(online: boolean, count: number | undefined): string {
  if (!online) return 'offline'
  if (count === undefined) return '—'
  return `${count} device${count === 1 ? '' : 's'}`
}

/** What LightsSection shows below the board picker: the devices/profile panel once this
 * board's lights have loaded, an inline retry error if the load failed, or nothing while the
 * first poll is still in flight. */
export function lightsLoadState(hasLights: boolean, loadFailed: boolean): 'panel' | 'error' | 'loading' {
  return hasLights ? 'panel' : loadFailed ? 'error' : 'loading'
}

export type EffectGroup<R> = { game: GameId | null; title: string; items: { rule: R; index: number }[] }

const isTriggerKind = (trigger: string): trigger is TriggerKind => Object.hasOwn(TRIGGER_GAME, trigger)

/** The effects by game: General first, then each game that has an effect. `index` is the rule's place in the
 *  profile, which Test and the numbering use. A trigger this build doesn't know goes under General. */
export function effectGroups<R extends { when: { trigger: string } }>(rules: readonly R[]): EffectGroup<R>[] {
  const gameOf = (r: R) => (isTriggerKind(r.when.trigger) ? TRIGGER_GAME[r.when.trigger] : null)
  return GROUP_ORDER.map(game => ({
    game,
    title: game === null ? 'General' : gameTitle(game),
    items: rules.flatMap((rule, index) => (gameOf(rule) === game ? [{ rule, index }] : [])),
  })).filter(g => g.items.length > 0)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The line after an import: 'Imported 14 effects, ignored 2, adjusted 1'. */
export function importSummary(r: { imported: number; ignored: readonly string[]; adjusted: readonly string[] }): string {
  const parts = [`Imported ${plural(r.imported, 'effect', 'effects')}`]
  if (r.ignored.length) parts.push(`ignored ${r.ignored.length}`)
  if (r.adjusted.length) parts.push(`adjusted ${r.adjusted.length}`)
  return parts.join(', ')
}
