// The Stats page's wording (Stats.dc.html): the range and filter choices, what the arrows compare
// with, and the line naming where a best happened. Number formats and arrows: lib/stats/trend.ts.
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

/** "Last 50 legs", "30 days", "All time": the range as its button says it, for a chart's key. */
export const rangeLabel = (range: StatsRange): string => [...LEG_RANGES, ...DAY_RANGES].find(r => r.id === range)?.label ?? ''

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

/** Darts at a finish and how many went out, over every double thrown at. */
export function doubleTotals(doubles: X01Stats['checkout']['doubles']): { hits: number; attempts: number } {
  return doubles.reduce((t, d) => ({ hits: t.hits + d.hits, attempts: t.attempts + d.attempts }), { hits: 0, attempts: 0 })
}
