// The admin Activity page (`#/admin/activity`): its data and how its numbers read (schema/api-v1.yaml, getAdminActivity).
import { api, type AdminActivity, type AdminActivityDrill } from '$lib/api'

export type { AdminActivity, AdminActivityDrill }

/** The ranges the page offers; 0 is all time. */
export const RANGES = [7, 30, 90, 0] as const
export type Range = (typeof RANGES)[number]

export async function loadActivity(days: Range): Promise<AdminActivity | null> {
  const res = await api.GET('/api/admin/activity', { params: { query: { days } } })
  return res.data ?? null
}

/** What one drill-down looks at: signups or finished games between `from` (inclusive) and `to`, optionally one cell of the weekday/hour grid. */
export type DrillQuery = { metric: 'signups' | 'games'; from: string; to: string; dow?: number; hour?: number }

export const DRILL_PAGE = 25

export async function loadDrill(q: DrillQuery, offset: number): Promise<AdminActivityDrill | null> {
  const res = await api.GET('/api/admin/activity/drill', { params: { query: { ...q, limit: DRILL_PAGE, offset } } })
  return res.data ?? null
}

/** A whole number with a thin gap between the thousands, as the design shows it ("1 284"). */
export const formatCount = (n: number): string => n.toLocaleString('en', { useGrouping: true }).replaceAll(',', ' ')

/** The change from `before` to `now` in whole percent, with its arrow ("▲ 18%"); null when there is nothing to compare with. */
export function trend(now: number, before: number): { label: string; up: boolean } | null {
  if (before === 0) return null
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { label: '0%', up: true }
  return { label: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, up: pct > 0 }
}

/** A share (0 to 1) as "11%", with a decimal below ten percent ("3.4%"). */
export function percent(share: number): string {
  const pct = share * 100
  return `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`
}

export type Granularity = 'day' | 'week' | 'month'
export const GRANULARITIES: Granularity[] = ['day', 'week', 'month']

/** One bar: the UTC days `from` (inclusive) to `to` (exclusive) it adds up, `start` being the bucket's own first day. */
export type Bucket = { start: Date; from: Date; to: Date; total: number; parts: Record<string, number> }

const DAY_MS = 86_400_000

/** The first day of the day, Monday-first week or month `day` (a UTC midnight) falls in. */
function bucketStart(day: Date, g: Granularity): Date {
  if (g === 'day') return day
  if (g === 'week') return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
}

/**
 * The per-day counts (oldest first, the last one on `today`'s UTC day) added up per day, week or month.
 * A bucket the range cuts into only covers the days it has, so its drill-down matches its bar.
 */
export function bucketize(perDay: Record<string, number>[], today: Date, g: Granularity): Bucket[] {
  const last = Math.floor(today.getTime() / DAY_MS) * DAY_MS
  const out: Bucket[] = []
  perDay.forEach((counts, i) => {
    const day = new Date(last - (perDay.length - 1 - i) * DAY_MS)
    const start = bucketStart(day, g)
    let b = out.at(-1)
    if (!b || b.start.getTime() !== start.getTime()) {
      b = { start, from: day, to: day, total: 0, parts: {} }
      out.push(b)
    }
    b.to = new Date(day.getTime() + DAY_MS)
    for (const [mode, n] of Object.entries(counts)) {
      b.parts[mode] = (b.parts[mode] ?? 0) + n
      b.total += n
    }
  })
  return out
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en', { ...o, timeZone: 'UTC' })

/** The short x-axis label of a bucket: "Nov 5" for a day or a week's Monday, "Nov 2026" for a month. */
export const bucketTick = (b: Bucket, g: Granularity): string =>
  g === 'month' ? fmt(b.start, { month: 'short', year: 'numeric' }) : fmt(b.start, { month: 'short', day: 'numeric' })

/** What a tooltip and the drill-down title call a bucket. */
export function bucketName(b: Bucket, g: Granularity): string {
  if (g === 'month') return fmt(b.start, { month: 'long', year: 'numeric' })
  if (g === 'week') return `Week of ${fmt(b.start, { weekday: 'short', day: 'numeric', month: 'short' })}`
  return fmt(b.start, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** The range switch's text: "7 days", "All time". */
export const rangeLabel = (r: Range): string => (r === 0 ? 'All time' : `${r} days`)

/** The granularity a range opens with: bars a few pixels wide are better as weeks or months. */
export const defaultGranularity = (r: Range): Granularity => (r === 90 ? 'week' : r === 0 ? 'month' : 'day')

/** The `from` and `to` of the drill-down query for one bucket. */
export const bucketRange = (b: Bucket): { from: string; to: string } => ({ from: b.from.toISOString(), to: b.to.toISOString() })

/** Bar fills per mode, in legend order (same colours as `MODE_COLORS`); modes past the palette share the last one. */
export const MODE_FILLS = ['fill-accent', 'fill-grade-great', 'fill-warn', 'fill-grade-brilliant', 'fill-ink-faint'] as const
export const modeFill = (modes: string[], mode: string): string =>
  MODE_FILLS[Math.min(Math.max(0, modes.indexOf(mode)), MODE_FILLS.length - 1)]

const HEAT_LEVELS = [0, 1, 2, 3, 4] as const

/** The heat of one cell of the busiest-hours grid, 0 (none) to 4 (the most), by share of the busiest cell. */
export function heatLevel(count: number, peak: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || peak <= 0) return 0
  return HEAT_LEVELS[Math.min(4, Math.ceil((count / peak) * 4))] ?? 0
}

/** "Sat 20–22 h": the busiest two-hour stretch of the week grid (rows Monday first, 24 UTC hours each); null when empty. */
export function busiestSlot(grid: number[][]): string | null {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let best = { sum: 0, day: 0, hour: 0 }
  grid.forEach((row, day) => {
    for (let hour = 0; hour < 23; hour++) {
      const sum = row[hour] + row[hour + 1]
      if (sum > best.sum) best = { sum, day, hour }
    }
  })
  return best.sum === 0 ? null : `${days[best.day]} ${best.hour}–${best.hour + 2} h`
}

/** Bar colours per mode, in legend order, from the design tokens; modes past the palette share the last one. */
export const MODE_COLORS = ['bg-accent', 'bg-grade-great', 'bg-warn', 'bg-grade-brilliant', 'bg-ink-faint'] as const
export const modeColor = (modes: string[], mode: string): string =>
  MODE_COLORS[Math.min(Math.max(0, modes.indexOf(mode)), MODE_COLORS.length - 1)]
