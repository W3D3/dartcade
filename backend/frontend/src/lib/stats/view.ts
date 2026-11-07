// The Stats page's wording and small sums (Stats.dc.html): the range and filter choices, the
// arrows against the range before, the line naming where a best happened, and the sparklines.
import type { StatRef, StatsKind, StatsOutMode, StatsRange, StatsSpan, X01Stats } from '$lib/api'
import { dayMonth } from '$lib/fmt'

export const LEG_RANGES: { id: StatsRange; label: string }[] = [
  { id: 'legs20', label: 'Last 20 legs' },
  { id: 'legs50', label: 'Last 50 legs' },
  { id: 'legs100', label: 'Last 100 legs' },
]
export const DAY_RANGES: { id: StatsRange; label: string }[] = [
  { id: 'days30', label: '30 days' },
  { id: 'days90', label: '90 days' },
  { id: 'all', label: 'All time' },
]
export const RANGE_IDS = [...LEG_RANGES, ...DAY_RANGES].map(r => r.id)

export const KINDS: { value: StatsKind; label: string }[] = [
  { value: 'all', label: 'All matches' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'casual', label: 'Against people' },
  { value: 'bots', label: 'Against bots' },
  { value: 'solo', label: 'Solo' },
]
export const KIND_IDS = KINDS.map(k => k.value)

export const OUT_LABELS: Record<StatsOutMode, string> = { double: 'Double out', straight: 'Straight out', master: 'Master out' }
export const OUT_IDS: StatsOutMode[] = ['double', 'straight', 'master']

const RANGE_SIZE: Record<Exclude<StatsRange, 'all'>, [number, string]> = {
  legs20: [20, 'legs'],
  legs50: [50, 'legs'],
  legs100: [100, 'legs'],
  days30: [30, 'days'],
  days90: [90, 'days'],
}

/** "the last 50 legs", "the last 30 days", "all time": what the numbers cover. */
export function rangeNoun(range: StatsRange): string {
  if (range === 'all') return 'all time'
  const [n, unit] = RANGE_SIZE[range]
  return `the last ${n} ${unit}`
}

/** "the 50 legs before": what the arrows compare with. */
export function beforeNoun(range: StatsRange): string | null {
  if (range === 'all') return null
  const [n, unit] = RANGE_SIZE[range]
  return `the ${n} ${unit} before`
}

/** The line under the range buttons; null for all time, which compares with nothing. */
export function compareNote(range: StatsRange, before: StatsSpan | null): string | null {
  const noun = beforeNoun(range)
  if (noun === null) return null
  if (before === null || before.from === null || before.to === null) return `Nothing to compare with yet: no legs in ${noun}`
  return `Arrows compare with ${noun} (${dayMonth(new Date(before.from))} – ${dayMonth(new Date(before.to))})`
}

export type Better = 'higher' | 'lower'
/** decimal: "▲ 3.1"; pts: a share's change in points, "▼ 2 pts"; count: "▲ 2". */
export type DeltaUnit = 'decimal' | 'pts' | 'count'
export type Delta = { text: string; good: boolean }

/** The arrow against the range before; null when either side is missing or nothing changed at the shown precision. */
export function delta(now: number | null, before: number | null, unit: DeltaUnit, better: Better): Delta | null {
  if (now === null || before === null) return null
  const diff =
    unit === 'pts' ? Math.round((now - before) * 100) : unit === 'decimal' ? Math.round((now - before) * 10) / 10 : Math.round(now - before)
  if (diff === 0) return null
  const size = unit === 'decimal' ? Math.abs(diff).toFixed(1) : String(Math.abs(diff))
  return { text: `${diff > 0 ? '▲' : '▼'} ${size}${unit === 'pts' ? ' pts' : ''}`, good: diff > 0 === (better === 'higher') }
}

/** Darts at a finish and how many went out, over every double thrown at. */
export function doubleTotals(doubles: X01Stats['checkout']['doubles']): { hits: number; attempts: number } {
  return doubles.reduce((t, d) => ({ hits: t.hits + d.hits, attempts: t.attempts + d.attempts }), { hits: 0, attempts: 0 })
}

export const dec1 = (n: number | null): string => (n === null ? '–' : n.toFixed(1))
export const pct = (n: number | null): string => (n === null ? '–' : `${Math.round(n * 100)}%`)

/** "501 · vs Lena · 12 Oct · leg 3", "Ranked · vs Anna K. · 2 Oct", "Solo practice · 17 Oct". */
export function refLine(ref: StatRef): string {
  const head = ref.kind === 'ranked' ? `Ranked ${ref.startScore}` : ref.kind === 'solo' ? 'Solo practice' : String(ref.startScore)
  const vs = ref.opponents.length > 0 ? `vs ${ref.opponents.join(', ')}` : null
  const leg = ref.leg !== null && ref.visit === null ? `leg ${ref.leg + 1}` : null
  return [head, vs, dayMonth(new Date(ref.finishedAt)), leg].filter(Boolean).join(' · ')
}

/** "Visit 2 of leg 1". */
export const visitTitle = (ref: StatRef): string => `Visit ${ref.visit ?? 1} of leg ${(ref.leg ?? 0) + 1}`

export const refHref = (ref: StatRef): string => `#/history/${ref.gameId}`

/** A sparkline's points in a w × h box, `pad` clear at top and bottom; a flat line for one value. */
export function sparkPoints(values: number[], w: number, h: number, pad = 3): string {
  if (values.length === 0) return ''
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - pad - ((v - lo) / span) * (h - 2 * pad)).toFixed(1)}`)
  return values.length > 1 ? pts.join(' ') : `0,${h / 2} ${w},${h / 2}`
}

/** Round axis bounds around `values`, in steps of `step`. */
export function axis(values: number[], step: number): { lo: number; hi: number; ticks: number[] } {
  const lo = Math.floor(Math.min(...values) / step) * step
  const hi = Math.max(lo + step, Math.ceil(Math.max(...values) / step) * step)
  return { lo, hi, ticks: Array.from({ length: (hi - lo) / step + 1 }, (_, i) => lo + i * step) }
}
